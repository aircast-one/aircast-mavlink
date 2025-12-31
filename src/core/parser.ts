// Base MAVLink dialect parser
import {
  ParsedMAVLinkMessage,
  MAVLinkFrame,
  MessageDefinition,
  IMessageParser,
  IMessageSerializer,
  IMessageRegistry,
} from './types'
import { parseFrame } from './frame'
import { decodePayload } from './codec'
import { StreamBuffer } from './stream-buffer'
import { MessageRegistry } from './message-registry'
import { MessageSerializer } from './message-serializer'

/**
 * Abstract base class for dialect-specific parsers.
 * Composes MessageRegistry and MessageSerializer for full functionality.
 */
export abstract class DialectParser
  implements IMessageParser, IMessageSerializer, IMessageRegistry
{
  protected readonly registry: MessageRegistry
  protected readonly serializer: MessageSerializer
  protected readonly dialectName: string
  private readonly streamBuffer: StreamBuffer

  constructor(dialectName: string) {
    this.dialectName = dialectName
    this.streamBuffer = new StreamBuffer()
    this.registry = new MessageRegistry()
    this.serializer = new MessageSerializer(this.registry)
  }

  /**
   * Register a message definition
   */
  protected registerMessageDefinition(def: MessageDefinition, crcExtra: number): void {
    this.registry.register(def, crcExtra)
  }

  /**
   * Load message definitions - must be implemented by dialect-specific subclass
   */
  abstract loadDefinitions(): Promise<void>

  // ============ IMessageParser ============

  /**
   * Parse incoming bytes and return any complete messages
   */
  parseBytes(data: Uint8Array): ParsedMAVLinkMessage[] {
    const results: ParsedMAVLinkMessage[] = []

    if (!data || data.length === 0) {
      return results
    }

    this.streamBuffer.append(data)

    const bufferData = this.streamBuffer.getContents()
    let offset = 0

    while (offset < bufferData.length) {
      const frameResult = parseFrame(bufferData.subarray(offset), this.registry.getCrcExtraTable())

      if (frameResult.frame) {
        const message = this.decode(frameResult.frame)
        results.push(message)
        offset += frameResult.bytesConsumed
      } else if (frameResult.bytesConsumed > 0) {
        offset += frameResult.bytesConsumed
      } else {
        break
      }
    }

    this.streamBuffer.consume(offset)
    return results
  }

  /**
   * Decode a MAVLink frame into a parsed message
   */
  decode(frame: MAVLinkFrame): ParsedMAVLinkMessage {
    const messageDef = this.registry.getMessageDefinition(frame.message_id)
    const protocolVersion = frame.protocol_version || (frame.magic === 0xfd ? 2 : 1)

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
      }
    }

    const payload = decodePayload(frame.payload, messageDef.fields)

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
    }
  }

  /**
   * Clear the internal buffer
   */
  resetBuffer(): void {
    this.streamBuffer.reset()
  }

  // ============ IMessageSerializer (delegated) ============

  /**
   * Serialize a message to MAVLink bytes
   */
  serializeMessage(message: Record<string, unknown> & { message_name: string }): Uint8Array {
    return this.serializer.serializeMessage(message)
  }

  /**
   * Complete a message with default values for all undefined fields
   */
  completeMessage(
    message: Record<string, unknown> & { message_name: string }
  ): Record<string, unknown> {
    return this.serializer.completeMessage(message)
  }

  // ============ IMessageRegistry (delegated) ============

  /**
   * Get message definition by ID
   */
  getMessageDefinition(id: number): MessageDefinition | undefined {
    return this.registry.getMessageDefinition(id)
  }

  /**
   * Get message definition by name
   */
  getMessageDefinitionByName(name: string): MessageDefinition | undefined {
    return this.registry.getMessageDefinitionByName(name)
  }

  /**
   * Check if a message ID is supported
   */
  supportsMessage(messageId: number): boolean {
    return this.registry.supportsMessage(messageId)
  }

  /**
   * Check if a message name is supported
   */
  supportsMessageName(messageName: string): boolean {
    return this.registry.supportsMessageName(messageName)
  }

  /**
   * Get all supported message IDs
   */
  getSupportedMessageIds(): number[] {
    return this.registry.getSupportedMessageIds()
  }

  /**
   * Get all supported message names
   */
  getSupportedMessageNames(): string[] {
    return this.registry.getSupportedMessageNames()
  }

  /**
   * Get the dialect name
   */
  getDialectName(): string {
    return this.dialectName
  }
}
