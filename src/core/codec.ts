// MAVLink field encoding and decoding
import { FieldDefinition, FieldValue, DecodedValue, PayloadObject } from './types'

/**
 * Get the size of a single MAVLink type in bytes
 */
export function getTypeSize(type: string): number {
  switch (type) {
    case 'uint8_t':
    case 'int8_t':
    case 'char':
      return 1
    case 'uint16_t':
    case 'int16_t':
      return 2
    case 'uint32_t':
    case 'int32_t':
    case 'float':
      return 4
    case 'uint64_t':
    case 'int64_t':
    case 'double':
      return 8
    default:
      return 1
  }
}

/**
 * Get the base type from a field type (strips array notation)
 */
export function getBaseType(type: string): string {
  if (type.includes('[') && type.includes(']')) {
    return type.substring(0, type.indexOf('['))
  }
  return type
}

/**
 * Get the total size of a field in bytes
 */
export function getFieldSize(field: FieldDefinition): number {
  const type = field.type
  const arrayLength = field.arrayLength

  if (arrayLength && arrayLength > 1) {
    return getTypeSize(getBaseType(type)) * arrayLength
  }

  if (type.includes('[') && type.includes(']')) {
    const baseType = getBaseType(type)
    const parsedLength = parseInt(type.substring(type.indexOf('[') + 1, type.indexOf(']')))
    return getTypeSize(baseType) * parsedLength
  }

  return getTypeSize(type)
}

/**
 * Get the element type size for wire order sorting
 * Arrays are sorted by element type, not total array size
 */
export function getFieldTypeSize(field: FieldDefinition): number {
  return getTypeSize(getBaseType(field.type))
}

/**
 * Sort fields by MAVLink v2 wire order
 * Core fields sorted by type size (largest first), extension fields last in XML order
 */
export function sortFieldsByWireOrder(fields: FieldDefinition[]): FieldDefinition[] {
  const coreFields: Array<{ field: FieldDefinition; originalIndex: number }> = []
  const extensionFields: FieldDefinition[] = []

  fields.forEach((field, index) => {
    if (field.extension) {
      extensionFields.push(field)
    } else {
      coreFields.push({ field, originalIndex: index })
    }
  })

  // Stable sort core fields by type size (descending)
  coreFields.sort((a, b) => {
    const sizeA = getFieldTypeSize(a.field)
    const sizeB = getFieldTypeSize(b.field)
    if (sizeB !== sizeA) {
      return sizeB - sizeA
    }
    return a.originalIndex - b.originalIndex
  })

  return [...coreFields.map((c) => c.field), ...extensionFields]
}

/**
 * Get default value for a MAVLink type
 */
export function getDefaultValue(type: string): number | bigint {
  switch (type) {
    case 'uint64_t':
    case 'int64_t':
      return 0n
    default:
      return 0
  }
}

/**
 * Get default value for a field
 */
export function getFieldDefaultValue(field: FieldDefinition): FieldValue {
  const isArray = field.arrayLength !== undefined && field.arrayLength > 1

  if (isArray) {
    return []
  }

  const baseType = getBaseType(field.type)

  switch (baseType) {
    case 'uint64_t':
    case 'int64_t':
      return 0n
    case 'char':
      return field.type.includes('[') ? '' : '\0'
    default:
      return 0
  }
}

/**
 * Decode a single value from a DataView
 */
export function decodeSingleValue(view: DataView, offset: number, type: string): DecodedValue {
  try {
    switch (type) {
      case 'uint8_t':
        return { value: view.getUint8(offset), bytesRead: 1 }
      case 'int8_t':
        return { value: view.getInt8(offset), bytesRead: 1 }
      case 'uint16_t':
        return { value: view.getUint16(offset, true), bytesRead: 2 }
      case 'int16_t':
        return { value: view.getInt16(offset, true), bytesRead: 2 }
      case 'uint32_t':
        return { value: view.getUint32(offset, true), bytesRead: 4 }
      case 'int32_t':
        return { value: view.getInt32(offset, true), bytesRead: 4 }
      case 'uint64_t':
        return { value: view.getBigUint64(offset, true), bytesRead: 8 }
      case 'int64_t':
        return { value: view.getBigInt64(offset, true), bytesRead: 8 }
      case 'float':
        return { value: view.getFloat32(offset, true), bytesRead: 4 }
      case 'double':
        return { value: view.getFloat64(offset, true), bytesRead: 8 }
      case 'char': {
        const charCode = view.getUint8(offset)
        return { value: charCode === 0 ? '\0' : String.fromCharCode(charCode), bytesRead: 1 }
      }
      default:
        // Handle inline array types like char[20]
        if (type.startsWith('char[') && type.endsWith(']')) {
          const length = parseInt(type.slice(5, -1))
          const chars: string[] = []
          for (let i = 0; i < length && offset + i < view.byteLength; i++) {
            const charCode = view.getUint8(offset + i)
            if (charCode === 0) break
            chars.push(String.fromCharCode(charCode))
          }
          return { value: chars.join(''), bytesRead: length }
        } else if (type.includes('[') && type.includes(']')) {
          const baseType = getBaseType(type)
          const arrayLength = parseInt(type.substring(type.indexOf('[') + 1, type.indexOf(']')))
          const values: (string | number | bigint | boolean)[] = []
          let totalBytes = 0

          for (let i = 0; i < arrayLength; i++) {
            if (offset + totalBytes >= view.byteLength) break
            const { value, bytesRead } = decodeSingleValue(view, offset + totalBytes, baseType)
            if (
              typeof value === 'string' ||
              typeof value === 'number' ||
              typeof value === 'bigint' ||
              typeof value === 'boolean'
            ) {
              values.push(value)
            }
            totalBytes += bytesRead
          }

          return { value: values, bytesRead: totalBytes }
        }
        return { value: view.getUint8(offset), bytesRead: 1 }
    }
  } catch {
    return { value: 0, bytesRead: 1 }
  }
}

/**
 * Decode a field from a DataView
 */
export function decodeField(view: DataView, offset: number, field: FieldDefinition): DecodedValue {
  const isArray = field.arrayLength !== undefined
  const arrayLength = field.arrayLength || 1

  if (isArray && arrayLength > 1) {
    const baseType = getBaseType(field.type)

    // Char arrays return as string
    if (baseType === 'char') {
      const chars: string[] = []
      let totalBytes = 0

      for (let i = 0; i < arrayLength; i++) {
        if (offset + totalBytes >= view.byteLength) break
        const charCode = view.getUint8(offset + totalBytes)
        if (charCode === 0) break
        chars.push(String.fromCharCode(charCode))
        totalBytes += 1
      }

      return { value: chars.join(''), bytesRead: arrayLength }
    }

    // Other arrays
    const values: (string | number | bigint | boolean)[] = []
    let totalBytes = 0

    for (let i = 0; i < arrayLength; i++) {
      if (offset + totalBytes >= view.byteLength) break
      const { value, bytesRead } = decodeSingleValue(view, offset + totalBytes, baseType)
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'bigint' ||
        typeof value === 'boolean'
      ) {
        values.push(value)
      }
      totalBytes += bytesRead
    }

    return { value: values, bytesRead: totalBytes }
  }

  return decodeSingleValue(view, offset, field.type)
}

/**
 * Decode a payload buffer into an object
 */
export function decodePayload(payload: Uint8Array, fields: FieldDefinition[]): PayloadObject {
  const result: PayloadObject = {}
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  let offset = 0

  const sortedFields = sortFieldsByWireOrder(fields)

  for (const field of sortedFields) {
    if (offset >= payload.length) {
      result[field.name] = getFieldDefaultValue(field)
    } else {
      const { value, bytesRead } = decodeField(view, offset, field)
      result[field.name] = value
      offset += bytesRead
    }
  }

  return result
}

/**
 * Encode a single value to a DataView
 */
export function encodeSingleValue(
  view: DataView,
  offset: number,
  type: string,
  value: unknown
): number {
  const actualValue = value ?? getDefaultValue(type)

  switch (type) {
    case 'uint8_t':
      view.setUint8(offset, Number(actualValue))
      return 1
    case 'int8_t':
      view.setInt8(offset, Number(actualValue))
      return 1
    case 'uint16_t':
      view.setUint16(offset, Number(actualValue), true)
      return 2
    case 'int16_t':
      view.setInt16(offset, Number(actualValue), true)
      return 2
    case 'uint32_t':
      view.setUint32(offset, Number(actualValue), true)
      return 4
    case 'int32_t':
      view.setInt32(offset, Number(actualValue), true)
      return 4
    case 'uint64_t':
      view.setBigUint64(
        offset,
        typeof actualValue === 'bigint' ? actualValue : BigInt(Number(actualValue) || 0),
        true
      )
      return 8
    case 'int64_t':
      view.setBigInt64(
        offset,
        typeof actualValue === 'bigint' ? actualValue : BigInt(Number(actualValue) || 0),
        true
      )
      return 8
    case 'float':
      view.setFloat32(offset, Number(actualValue), true)
      return 4
    case 'double':
      view.setFloat64(offset, Number(actualValue), true)
      return 8
    case 'char':
      view.setUint8(
        offset,
        typeof actualValue === 'string' ? actualValue.charCodeAt(0) : Number(actualValue)
      )
      return 1
    default:
      if (type.startsWith('char[') && type.endsWith(']')) {
        const length = parseInt(type.slice(5, -1))
        const str = String(actualValue)
        for (let i = 0; i < length; i++) {
          const charCode = i < str.length ? str.charCodeAt(i) : 0
          view.setUint8(offset + i, charCode)
        }
        return length
      }
      view.setUint8(offset, Number(actualValue))
      return 1
  }
}

/**
 * Encode a field to a DataView
 */
export function encodeField(
  view: DataView,
  offset: number,
  field: FieldDefinition,
  value: unknown
): number {
  const isArray = field.arrayLength !== undefined
  const arrayLength = field.arrayLength || 1

  if (isArray && arrayLength > 1) {
    let totalBytes = 0
    const baseType = getBaseType(field.type)

    // Char arrays from string
    if (baseType === 'char' && typeof value === 'string') {
      const str = value
      for (let i = 0; i < arrayLength; i++) {
        const charCode = i < str.length ? str.charCodeAt(i) : 0
        view.setUint8(offset + totalBytes, charCode)
        totalBytes += 1
      }
      return totalBytes
    }

    // Other arrays
    const arrayValue = Array.isArray(value) ? value : [value]
    for (let i = 0; i < arrayLength; i++) {
      const itemValue = i < arrayValue.length ? arrayValue[i] : getDefaultValue(baseType)
      const bytesWritten = encodeSingleValue(view, offset + totalBytes, baseType, itemValue)
      totalBytes += bytesWritten
    }
    return totalBytes
  }

  return encodeSingleValue(view, offset, field.type, value)
}

/**
 * Encode a payload object to bytes with MAVLink payload trimming
 */
export function encodePayload(
  message: Record<string, unknown>,
  fields: FieldDefinition[]
): Uint8Array {
  const sortedFields = sortFieldsByWireOrder(fields)

  // Calculate total size
  let totalSize = 0
  for (const field of sortedFields) {
    totalSize += getFieldSize(field)
  }

  const buffer = new ArrayBuffer(totalSize)
  const view = new DataView(buffer)
  let offset = 0

  for (const field of sortedFields) {
    const value = message[field.name]
    const bytesWritten = encodeField(view, offset, field, value)
    offset += bytesWritten
  }

  const fullPayload = new Uint8Array(buffer)

  // Calculate core payload size and find extension start
  let corePayloadSize = 0
  let extensionStartOffset = 0
  let hasExtensions = false

  for (const field of sortedFields) {
    const fieldSize = getFieldSize(field)

    if (field.extension === true) {
      if (!hasExtensions) {
        extensionStartOffset = corePayloadSize
        hasExtensions = true
      }
    } else {
      corePayloadSize += fieldSize
    }
  }

  // No extensions, no trimming
  if (!hasExtensions) {
    return fullPayload
  }

  // Trim trailing zeros from extension fields
  let trimmedLength = fullPayload.length

  if (hasExtensions && extensionStartOffset < fullPayload.length) {
    let hasNonZeroExtensions = false
    for (let i = extensionStartOffset; i < fullPayload.length; i++) {
      if (fullPayload[i] !== 0) {
        hasNonZeroExtensions = true
        break
      }
    }

    if (!hasNonZeroExtensions) {
      trimmedLength = corePayloadSize
    } else {
      for (let i = fullPayload.length - 1; i >= extensionStartOffset; i--) {
        if (fullPayload[i] !== 0) {
          trimmedLength = i + 1
          break
        }
      }
    }
  }

  if (trimmedLength < corePayloadSize) {
    trimmedLength = corePayloadSize
  }

  if (trimmedLength < fullPayload.length) {
    return fullPayload.slice(0, trimmedLength)
  }

  return fullPayload
}
