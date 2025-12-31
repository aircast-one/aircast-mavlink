// Base MAVLink dialect parser
import {
  ParsedMAVLinkMessage,
  MAVLinkFrame,
  MessageDefinition,
  FieldDefinition,
} from './types';
import { parseFrame, createFrame } from './frame';
import {
  decodePayload,
  encodePayload,
  getFieldDefaultValue,
  sortFieldsByWireOrder,
  getFieldSize,
} from './codec';

/**
 * Abstract base class for dialect-specific parsers
 * Handles MAVLink frame parsing, message decoding, and serialization
 */
export abstract class DialectParser {
  protected messageDefinitions: Map<number, MessageDefinition> = new Map();
  protected crcExtraTable: Record<number, number> = {};
  protected dialectName: string;
  private buffer: Uint8Array = new Uint8Array(0);

  constructor(dialectName: string) {
    this.dialectName = dialectName;
  }

  /**
   * Load message definitions - must be implemented by dialect-specific subclass
   */
  abstract loadDefinitions(): Promise<void>;

  /**
   * Set the CRC_EXTRA table for this dialect
   */
  protected setCrcExtraTable(table: Record<number, number>): void {
    this.crcExtraTable = table;
  }

  /**
   * Parse incoming bytes and return any complete messages
   */
  parseBytes(data: Uint8Array): ParsedMAVLinkMessage[] {
    const results: ParsedMAVLinkMessage[] = [];

    if (!data || data.length === 0) {
      return results;
    }

    // Append new data to buffer
    const newBuffer = new Uint8Array(this.buffer.length + data.length);
    newBuffer.set(this.buffer);
    newBuffer.set(data, this.buffer.length);
    this.buffer = newBuffer;

    let offset = 0;

    while (offset < this.buffer.length) {
      const frameResult = parseFrame(this.buffer.slice(offset), this.crcExtraTable);

      if (frameResult.frame) {
        const message = this.decode(frameResult.frame);
        results.push(message);
        offset += frameResult.bytesConsumed;
      } else if (frameResult.bytesConsumed > 0) {
        offset += frameResult.bytesConsumed;
      } else {
        break;
      }
    }

    this.buffer = this.buffer.slice(offset);
    return results;
  }

  /**
   * Clear the internal buffer
   */
  resetBuffer(): void {
    this.buffer = new Uint8Array(0);
  }

  /**
   * Decode a MAVLink frame into a parsed message
   */
  decode(frame: MAVLinkFrame): ParsedMAVLinkMessage {
    const messageDef = this.messageDefinitions.get(frame.message_id);
    const protocolVersion = frame.protocol_version || (frame.magic === 0xfd ? 2 : 1);

    if (!messageDef) {
      return {
        timestamp: Date.now(),
        system_id: frame.system_id,
        component_id: frame.component_id,
        message_id: frame.message_id,
        message_name: `UNKNOWN_${frame.message_id}`,
        sequence: frame.sequence,
        payload: {
          raw_payload: Array.from(frame.payload),
        },
        protocol_version: protocolVersion,
        checksum: frame.checksum,
        crc_ok: frame.crc_ok ?? true,
        signature: frame.signature,
        dialect: this.dialectName,
      };
    }

    const payload = decodePayload(frame.payload, messageDef.fields);

    return {
      timestamp: Date.now(),
      system_id: frame.system_id,
      component_id: frame.component_id,
      message_id: frame.message_id,
      message_name: messageDef.name,
      sequence: frame.sequence,
      payload,
      protocol_version: protocolVersion,
      checksum: frame.checksum,
      crc_ok: frame.crc_ok ?? true,
      signature: frame.signature,
      dialect: this.dialectName,
    };
  }

  /**
   * Serialize a message to MAVLink bytes
   */
  serializeMessage(message: Record<string, unknown> & { message_name: string }): Uint8Array {
    const messageDef = Array.from(this.messageDefinitions.values()).find(
      def => def.name === message.message_name
    );

    if (!messageDef) {
      throw new Error(`Unknown message type: ${message.message_name}`);
    }

    const messageFields = this.extractMessageFields(message, messageDef.fields);
    const completeMessage = this.completeMessageWithDefaults(messageFields, messageDef.fields);
    const payload = encodePayload(completeMessage, messageDef.fields);

    const systemId = typeof message.system_id === 'number' ? message.system_id : 1;
    const componentId = typeof message.component_id === 'number' ? message.component_id : 1;
    const sequence = typeof message.sequence === 'number' ? message.sequence : 0;

    const crcExtra = this.crcExtraTable[messageDef.id];
    if (crcExtra === undefined) {
      throw new Error(`No CRC_EXTRA defined for message ID ${messageDef.id}`);
    }

    const needsV2 = messageDef.id > 255;
    const userVersion = typeof message.protocol_version === 'number' ? message.protocol_version : undefined;
    const protocolVersion = (userVersion ?? (needsV2 ? 2 : 1)) as 1 | 2;

    return createFrame(
      messageDef.id,
      payload,
      systemId,
      componentId,
      sequence,
      crcExtra,
      protocolVersion
    );
  }

  /**
   * Extract message fields from payload structure
   */
  private extractMessageFields(
    message: Record<string, unknown>,
    _fieldDefinitions: FieldDefinition[]
  ): Record<string, unknown> {
    if (!message.payload || typeof message.payload !== 'object') {
      throw new Error(
        `Message must have a 'payload' object containing the message fields. ` +
          `Expected format: { message_name: '...', system_id: 1, component_id: 1, sequence: 0, payload: { ...fields } }`
      );
    }
    return message.payload as Record<string, unknown>;
  }

  /**
   * Complete message with default values for missing fields
   */
  private completeMessageWithDefaults(
    message: Record<string, unknown>,
    fields: FieldDefinition[]
  ): Record<string, unknown> {
    const completeMessage = { ...message };

    for (const field of fields) {
      if (completeMessage[field.name] === undefined) {
        completeMessage[field.name] = getFieldDefaultValue(field);
      }
    }

    return completeMessage;
  }

  /**
   * Get message definition by ID
   */
  getMessageDefinition(id: number): MessageDefinition | undefined {
    return this.messageDefinitions.get(id);
  }

  /**
   * Get all supported message IDs
   */
  getSupportedMessageIds(): number[] {
    return Array.from(this.messageDefinitions.keys()).sort((a, b) => a - b);
  }

  /**
   * Get the dialect name
   */
  getDialectName(): string {
    return this.dialectName;
  }

  /**
   * Check if a message ID is supported
   */
  supportsMessage(messageId: number): boolean {
    return this.messageDefinitions.has(messageId);
  }
}

/**
 * Dialect-specific serializer wrapper
 */
export class DialectSerializer<T extends DialectParser> {
  private parser: T;

  constructor(parser: T) {
    this.parser = parser;
  }

  /**
   * Serialize a message to MAVLink bytes
   */
  serialize(message: Record<string, unknown> & { message_name: string }): Uint8Array {
    return this.parser.serializeMessage(message);
  }

  /**
   * Complete a message with all defined fields
   */
  completeMessage(message: Record<string, unknown> & { message_name: string }): Record<string, unknown> {
    const messageDef = Array.from((this.parser as any).messageDefinitions.values()).find(
      (def: any) => def.name === message.message_name
    ) as MessageDefinition | undefined;

    if (!messageDef) {
      throw new Error(`Unknown message type: ${message.message_name}`);
    }

    if (!message.payload || typeof message.payload !== 'object') {
      throw new Error(
        `Message must have a 'payload' object containing the message fields.`
      );
    }

    const messageFields = message.payload as Record<string, unknown>;
    const sortedFields = sortFieldsByWireOrder(messageDef.fields);

    const completedFields: Record<string, unknown> = { ...messageFields };
    for (const field of sortedFields) {
      if (completedFields[field.name] === undefined) {
        completedFields[field.name] = getFieldDefaultValue(field);
      }
    }

    return {
      ...message,
      payload: completedFields,
    };
  }

  /**
   * Get supported message names
   */
  getSupportedMessages(): string[] {
    return Array.from((this.parser as any).messageDefinitions.values()).map(
      (def: any) => def.name
    );
  }

  /**
   * Check if a message name is supported
   */
  supportsMessage(messageName: string): boolean {
    return Array.from((this.parser as any).messageDefinitions.values()).some(
      (def: any) => def.name === messageName
    );
  }
}
