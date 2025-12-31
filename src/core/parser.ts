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
} from './codec';

// Ring buffer for efficient streaming - avoids repeated array allocations
const DEFAULT_BUFFER_SIZE = 4096;

/**
 * Abstract base class for dialect-specific parsers
 * Handles MAVLink frame parsing, message decoding, and serialization
 */
export abstract class DialectParser {
  protected messageDefinitions: Map<number, MessageDefinition> = new Map();
  protected messageDefinitionsByName: Map<string, MessageDefinition> = new Map();
  protected crcExtraTable: Record<number, number> = {};
  protected dialectName: string;

  // Ring buffer for streaming
  private buffer: Uint8Array;
  private bufferStart = 0;
  private bufferEnd = 0;

  constructor(dialectName: string) {
    this.dialectName = dialectName;
    this.buffer = new Uint8Array(DEFAULT_BUFFER_SIZE);
  }

  /**
   * Register a message definition (updates both ID and name indexes)
   */
  protected registerMessageDefinition(def: MessageDefinition): void {
    this.messageDefinitions.set(def.id, def);
    this.messageDefinitionsByName.set(def.name, def);
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

    // Append new data to ring buffer
    this.appendToBuffer(data);

    // Get current buffer contents
    let bufferData = this.getBufferContents();
    let offset = 0;

    while (offset < bufferData.length) {
      const frameResult = parseFrame(bufferData.subarray(offset), this.crcExtraTable);

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

    // Consume processed bytes
    this.consumeBuffer(offset);
    return results;
  }

  /**
   * Append data to ring buffer, growing if necessary
   */
  private appendToBuffer(data: Uint8Array): void {
    const currentLength = this.bufferEnd - this.bufferStart;
    const requiredSize = currentLength + data.length;

    // Grow buffer if needed
    if (requiredSize > this.buffer.length) {
      const newSize = Math.max(this.buffer.length * 2, requiredSize);
      const newBuffer = new Uint8Array(newSize);
      newBuffer.set(this.getBufferContents());
      this.buffer = newBuffer;
      this.bufferStart = 0;
      this.bufferEnd = currentLength;
    } else if (this.bufferEnd + data.length > this.buffer.length) {
      // Compact: move data to start of buffer
      const contents = this.getBufferContents();
      this.buffer.set(contents);
      this.bufferStart = 0;
      this.bufferEnd = currentLength;
    }

    this.buffer.set(data, this.bufferEnd);
    this.bufferEnd += data.length;
  }

  /**
   * Get current buffer contents as a view
   */
  private getBufferContents(): Uint8Array {
    return this.buffer.subarray(this.bufferStart, this.bufferEnd);
  }

  /**
   * Consume bytes from the start of the buffer
   */
  private consumeBuffer(bytes: number): void {
    this.bufferStart += bytes;
    if (this.bufferStart === this.bufferEnd) {
      this.bufferStart = 0;
      this.bufferEnd = 0;
    }
  }

  /**
   * Clear the internal buffer
   */
  resetBuffer(): void {
    this.bufferStart = 0;
    this.bufferEnd = 0;
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
    const messageDef = this.messageDefinitionsByName.get(message.message_name);

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

  /**
   * Check if a message name is supported
   */
  supportsMessageName(messageName: string): boolean {
    return this.messageDefinitionsByName.has(messageName);
  }

  /**
   * Get message definition by name (O(1) lookup)
   */
  getMessageDefinitionByName(name: string): MessageDefinition | undefined {
    return this.messageDefinitionsByName.get(name);
  }

  /**
   * Get all supported message names
   */
  getSupportedMessageNames(): string[] {
    return Array.from(this.messageDefinitionsByName.keys());
  }

  /**
   * Complete a message with default values for all undefined fields
   */
  completeMessage(message: Record<string, unknown> & { message_name: string }): Record<string, unknown> {
    const messageDef = this.messageDefinitionsByName.get(message.message_name);

    if (!messageDef) {
      throw new Error(`Unknown message type: ${message.message_name}`);
    }

    if (!message.payload || typeof message.payload !== 'object') {
      throw new Error(`Message must have a 'payload' object containing the message fields.`);
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
}
