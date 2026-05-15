/**
 * MAVLink CRC implementation for code generation
 * Computes CRC_EXTRA from message definitions per MAVLink specification
 * Reference: https://mavlink.io/en/guide/serialization.html#crc_extra
 */

const X25_INIT_CRC = 0xffff

/**
 * Accumulate a single byte into X.25 CRC
 */
function crcAccumulateByte(crc: number, byte: number): number {
  let tmp = byte ^ (crc & 0xff)
  tmp = (tmp ^ (tmp << 4)) & 0xff
  return ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xffff
}

/**
 * Accumulate a string into X.25 CRC
 */
function crcAccumulateString(crc: number, str: string): number {
  for (let i = 0; i < str.length; i++) {
    crc = crcAccumulateByte(crc, str.charCodeAt(i))
  }
  return crc
}

/**
 * Get the size of a MAVLink base type in bytes (for wire order sorting)
 */
function getTypeSize(type: string): number {
  switch (type) {
    case 'double':
    case 'uint64_t':
    case 'int64_t':
      return 8
    case 'float':
    case 'uint32_t':
    case 'int32_t':
      return 4
    case 'uint16_t':
    case 'int16_t':
      return 2
    case 'uint8_t':
    case 'int8_t':
    case 'char':
    case 'uint8_t_mavlink_version':
      return 1
    default:
      throw new Error(`Unknown MAVLink type for CRC computation: ${type}`)
  }
}

/**
 * Parse a field type string into base type and optional array length.
 * Normalizes special type aliases to their wire types:
 * - uint8_t_mavlink_version → uint8_t (used only in HEARTBEAT)
 *
 * e.g. "uint8_t[4]" → { baseType: "uint8_t", arrayLength: 4 }
 * e.g. "float" → { baseType: "float", arrayLength: null }
 */
function parseFieldType(type: string): { baseType: string; arrayLength: number | null } {
  const match = type.match(/^(.+?)\[(\d+)\]$/)
  const rawBase = match ? match[1] : type
  const arrayLength = match ? parseInt(match[2]) : null

  // Normalize special aliases to wire types (pymavlink does this in mavparse.py)
  const baseType = rawBase === 'uint8_t_mavlink_version' ? 'uint8_t' : rawBase

  return { baseType, arrayLength }
}

interface CrcField {
  name: string
  type: string
  extension?: boolean
}

/**
 * Compute CRC_EXTRA for a MAVLink message from its definition.
 *
 * Per MAVLink specification, CRC_EXTRA is an 8-bit value computed from:
 * - Message name
 * - Each core field (not extensions), sorted by type size descending:
 *   - Field base type name
 *   - Field name
 *   - Array length (if array field)
 */
export function computeCrcExtra(messageName: string, fields: CrcField[]): number {
  let crc = X25_INIT_CRC

  // Accumulate message name + space
  crc = crcAccumulateString(crc, messageName + ' ')

  // Filter out extension fields, sort core fields by type size (descending), stable
  const coreFields = fields
    .map((field, index) => ({ field, originalIndex: index }))
    .filter(({ field }) => !field.extension)

  coreFields.sort((a, b) => {
    const { baseType: typeA } = parseFieldType(a.field.type)
    const { baseType: typeB } = parseFieldType(b.field.type)
    const sizeA = getTypeSize(typeA)
    const sizeB = getTypeSize(typeB)
    if (sizeA !== sizeB) return sizeB - sizeA
    return a.originalIndex - b.originalIndex
  })

  for (const { field } of coreFields) {
    const { baseType, arrayLength } = parseFieldType(field.type)
    getTypeSize(baseType) // validate known type, throws for unknown

    crc = crcAccumulateString(crc, baseType + ' ')
    crc = crcAccumulateString(crc, field.name + ' ')

    if (arrayLength !== null) {
      crc = crcAccumulateByte(crc, arrayLength)
    }
  }

  return (crc & 0xff) ^ (crc >> 8)
}
