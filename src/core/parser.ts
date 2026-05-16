// Base MAVLink dialect parser
import { ParsedMAVLinkMessage, MAVLinkFrame, MessageDefinition } from './types'
import { parseFrame } from './frame'
import { decodePayload } from './codec'
import { StreamBuffer } from './stream-buffer'
import { MessageRegistry } from './message-registry'

/**
 * Base class for dialect-specific parsers.
 * Handles frame parsing, buffering, and payload decoding.
 */
export class DialectParser {
  protected readonly registry: MessageRegistry
  protected readonly dialectName: string
  private readonly streamBuffer: StreamBuffer

  constructor(dialectName: string) {
    this.dialectName = dialectName
    this.streamBuffer = new StreamBuffer()
    this.registry = new MessageRegistry()
  }

  protected registerMessageDefinition(def: MessageDefinition): void {
    this.registry.register(def)
  }

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

  resetBuffer(): void {
    this.streamBuffer.reset()
  }

  getDialectName(): string {
    return this.dialectName
  }
}
