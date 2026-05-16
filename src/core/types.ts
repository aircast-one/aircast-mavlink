// Shared type definitions for MAVLink protocol

/**
 * Base fields present on all parsed MAVLink messages.
 * Dialect-specific parsers extend this with a discriminated union
 * that narrows message_name and payload together.
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
  incompatible_flags?: number
  compatible_flags?: number
  sequence: number
  system_id: number
  component_id: number
  message_id: number
  payload: Uint8Array
  checksum: number
  signature?: Uint8Array
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
  crcExtra: number
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
 * Options for serializing a MAVLink message
 */
export interface SerializeOptions {
  system_id: number
  component_id: number
  sequence: number
  protocol_version?: 1 | 2
}
