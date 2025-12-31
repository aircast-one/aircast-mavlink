// Shared type definitions for MAVLink protocol
// These types are used by all dialect parsers

/**
 * A fully parsed MAVLink message with decoded payload
 */
export interface ParsedMAVLinkMessage {
  timestamp: number
  system_id: number
  component_id: number
  message_id: number
  message_name: string
  sequence: number
  payload: Record<string, unknown>
  protocol_version: 1 | 2
  checksum: number
  crc_ok: boolean
  signature?: Uint8Array
  dialect?: string
}

/**
 * A raw MAVLink frame before payload decoding
 */
export interface MAVLinkFrame {
  magic: number
  length: number
  incompatible_flags?: number // v2 only
  compatible_flags?: number // v2 only
  sequence: number
  system_id: number
  component_id: number
  message_id: number
  payload: Uint8Array
  checksum: number
  signature?: Uint8Array // v2 only, 13 bytes
  crc_ok?: boolean
  protocol_version?: 1 | 2
}

/**
 * Definition of a single field within a message
 */
export interface FieldDefinition {
  name: string
  type: string
  arrayLength?: number
  extension?: boolean
}

/**
 * Definition of a complete MAVLink message
 */
export interface MessageDefinition {
  id: number
  name: string
  fields: FieldDefinition[]
}

/**
 * Value types that can be encoded/decoded in MAVLink fields
 */
export type FieldValue =
  | string
  | number
  | bigint
  | boolean
  | Array<string | number | bigint | boolean>

/**
 * A decoded payload object
 */
export type PayloadObject = Record<string, FieldValue>

/**
 * Result of decoding a single field value
 */
export type DecodedValue = { value: FieldValue; bytesRead: number }

/**
 * Interface for message parsing functionality
 */
export interface IMessageParser {
  parseBytes(data: Uint8Array): ParsedMAVLinkMessage[]
  decode(frame: MAVLinkFrame): ParsedMAVLinkMessage
  resetBuffer(): void
}

/**
 * Interface for message serialization functionality
 */
export interface IMessageSerializer {
  serializeMessage(message: Record<string, unknown> & { message_name: string }): Uint8Array
  completeMessage(
    message: Record<string, unknown> & { message_name: string }
  ): Record<string, unknown>
}

/**
 * Interface for message registry functionality
 */
export interface IMessageRegistry {
  getMessageDefinition(id: number): MessageDefinition | undefined
  getMessageDefinitionByName(name: string): MessageDefinition | undefined
  supportsMessage(messageId: number): boolean
  supportsMessageName(messageName: string): boolean
  getSupportedMessageIds(): number[]
  getSupportedMessageNames(): string[]
}
