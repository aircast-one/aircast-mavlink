import {
  MAVLinkDialectDefinition,
  EnumDefinition,
  MessageDefinition,
  FieldDefinition,
  TypeScriptDialect,
  TypeScriptEnum,
  TypeScriptMessage,
  TypeScriptField,
} from '../types'
import { CRC_EXTRA } from './mavlink-crc'

export class TypeConverter {
  private static readonly MAVLINK_TO_TS_TYPES: Record<string, string> = {
    double: 'number',
    uint64_t: 'number',
    int64_t: 'number',
    float: 'number',
    uint32_t: 'number',
    int32_t: 'number',
    uint16_t: 'number',
    int16_t: 'number',
    uint8_t: 'number',
    int8_t: 'number',
    char: 'string',
    uint8_t_mavlink_version: 'number',
  }

  convert(definition: MAVLinkDialectDefinition, dialectName: string): TypeScriptDialect {
    const tsDialect: TypeScriptDialect = {
      dialectName,
      enums: [],
      messages: [],
    }

    // Convert enums with deduplication
    if (definition.enums) {
      const enumMap = new Map<string, TypeScriptEnum>()

      for (const enumDef of definition.enums) {
        const tsEnum = this.convertEnum(enumDef)
        if (tsEnum) {
          const existingEnum = enumMap.get(tsEnum.name)
          if (existingEnum) {
            // Merge values from duplicate enum
            for (const value of tsEnum.values) {
              const existingValue = existingEnum.values.find((v) => v.name === value.name)
              if (!existingValue) {
                existingEnum.values.push(value)
              }
            }
            // Merge descriptions
            existingEnum.description = [...existingEnum.description, ...tsEnum.description]
          } else {
            enumMap.set(tsEnum.name, tsEnum)
          }
        }
      }

      tsDialect.enums = Array.from(enumMap.values())
    }

    // Convert messages
    if (definition.messages) {
      for (const messageDef of definition.messages) {
        const tsMessage = this.convertMessage(messageDef, tsDialect.enums)
        if (tsMessage) {
          tsDialect.messages.push(tsMessage)
        }
      }
    }

    return tsDialect
  }

  private convertEnum(enumDef: EnumDefinition): TypeScriptEnum | null {
    if (!enumDef || !enumDef.name || !enumDef.entries || enumDef.entries.length === 0) {
      return null
    }

    const tsEnum: TypeScriptEnum = {
      name: enumDef.name,
      description: this.parseDescription(enumDef.description || ''),
      bitmask: enumDef.bitmask || false,
      values: [],
    }

    for (const entry of enumDef.entries) {
      const value = this.parseEnumValue(entry.value)
      if (value !== null) {
        tsEnum.values.push({
          name: entry.name,
          value,
          description: this.parseDescription(entry.description || ''),
        })
      }
    }

    return tsEnum
  }

  private convertMessage(
    messageDef: MessageDefinition,
    enums: TypeScriptEnum[]
  ): TypeScriptMessage | null {
    if (!messageDef.name || !messageDef.fields) {
      return null
    }

    const tsMessage: TypeScriptMessage = {
      id: messageDef.id,
      name: this.convertMessageName(messageDef.name),
      originalName: messageDef.name,
      description: this.parseDescription(messageDef.description || ''),
      fields: [],
      crcExtra: CRC_EXTRA[messageDef.id] || 0,
    }

    // Sort fields according to MAVLink wire format specification
    // Most messages maintain XML order, only specific messages need size-based sorting
    const sortedFields = this.sortFieldsForWireFormat(messageDef.fields, messageDef.name)

    for (const fieldDef of sortedFields) {
      const tsField = this.convertField(fieldDef, enums)
      if (tsField) {
        tsMessage.fields.push(tsField)
      }
    }

    return tsMessage
  }

  /**
   * Sort fields according to MAVLink wire format specification.
   * Most MAVLink messages should maintain their XML field order.
   * Only specific messages with known field ordering issues should be sorted by size.
   *
   * References:
   * - MAVLink wire format specification
   * - Compatibility with reference implementations (node-mavlink, pymavlink)
   */

  private sortFieldsForWireFormat(
    fields: FieldDefinition[],
    messageName: string
  ): FieldDefinition[] {
    // Messages that are correctly defined in XML and should maintain field order
    // Being conservative - only including messages I'm certain about
    const correctlyOrderedMessages: string | string[] = [
      // NOTE: GPS_RAW_INT removed - analysis shows it needs size-based sorting too
      // NOTE: HEARTBEAT should use size-based sorting per MAVLink wire format spec
    ]

    // If this message is correctly ordered in XML, maintain the original field order
    if (correctlyOrderedMessages.includes(messageName)) {
      // Separate extension fields from core fields but don't sort either
      const coreFields = fields.filter((field) => !field.extension)
      const extensionFields = fields.filter((field) => field.extension)

      // Return fields in original XML order
      return [...coreFields, ...extensionFields]
    }

    // For messages with known field ordering issues, sort by size
    // Separate extension fields from core fields
    const coreFields = fields.filter((field) => !field.extension)
    const extensionFields = fields.filter((field) => field.extension)

    // Sort core fields by size (largest first) for wire format efficiency
    const sortedCoreFields = this.sortFieldsBySize(coreFields)

    // Extension fields maintain XML order (not sorted by size per MAVLink spec)
    const sortedExtensionFields = extensionFields

    // Return core fields first, then extension fields
    return [...sortedCoreFields, ...sortedExtensionFields]
  }

  private sortFieldsBySize(fields: FieldDefinition[]): FieldDefinition[] {
    // Field size mapping based on MAVLink specification
    // Per MAVLink wire format: arrays are sorted by ELEMENT type size, not total array size
    // See: https://mavlink.io/en/guide/serialization.html#field_reordering
    const getFieldSize = (type: string): number => {
      // Handle array types - sort by element type size (not total array size)
      const arrayMatch = type.match(/^(.+?)\[(\d+)\]$/)
      if (arrayMatch) {
        const baseType = arrayMatch[1]
        return this.getBaseTypeSize(baseType) // Element size only
      }
      return this.getBaseTypeSize(type)
    }

    // Create a copy of the fields array to avoid mutating the original
    const sortedFields = [...fields]

    // Sort by field size (descending) then by original order (stable sort)
    sortedFields.sort((a, b) => {
      const sizeA = getFieldSize(a.type)
      const sizeB = getFieldSize(b.type)

      if (sizeA !== sizeB) {
        return sizeB - sizeA // Larger fields first
      }

      // If sizes are equal, maintain original order (stable sort)
      return fields.indexOf(a) - fields.indexOf(b)
    })

    return sortedFields
  }

  private getBaseTypeSize(type: string): number {
    switch (type) {
      case 'double':
        return 8
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
        console.warn(`Unknown MAVLink type for size calculation: ${type}`)
        return 1 // Default to 1 byte
    }
  }

  private convertField(fieldDef: FieldDefinition, enums: TypeScriptEnum[]): TypeScriptField | null {
    if (!fieldDef.name || !fieldDef.type) {
      return null
    }

    let arrayLength: number | undefined
    let originalType = fieldDef.type

    // Handle array types like uint8_t[4]
    const arrayMatch = fieldDef.type.match(/^([^[]+)\[(\d+)\]$/)
    if (arrayMatch) {
      originalType = arrayMatch[1]
      arrayLength = parseInt(arrayMatch[2])
    }

    const tsField: TypeScriptField = {
      name: this.convertFieldName(fieldDef.name),
      type: this.convertFieldType(fieldDef.type, fieldDef.enum, enums),
      originalType: originalType,
      description: this.parseDescription(fieldDef.description || ''),
      optional: fieldDef.extension || false,
      arrayLength,
      extension: fieldDef.extension,
    }

    return tsField
  }

  private convertMessageName(name: string): string {
    // Convert UPPER_CASE to PascalCase
    return name
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('')
  }

  private convertFieldName(name: string): string {
    // Keep snake_case format (no conversion)
    return name.toLowerCase()
  }

  private convertFieldType(
    type: string,
    enumName: string | undefined,
    enums: TypeScriptEnum[]
  ): string {
    // Handle arrays
    const arrayMatch = type.match(/^(.+?)\[(\d+)\]$/)
    if (arrayMatch) {
      const elementType = arrayMatch[1]

      // Handle string arrays (char arrays)
      if (elementType === 'char') {
        return 'string'
      }

      // Handle other arrays
      const tsElementType = this.convertSingleType(elementType, enumName, enums)
      return `${tsElementType}[]`
    }

    return this.convertSingleType(type, enumName, enums)
  }

  private convertSingleType(
    type: string,
    enumName: string | undefined,
    enums: TypeScriptEnum[]
  ): string {
    // If there's an enum specified, use it
    if (enumName) {
      const enumExists = enums.find((e) => e.name === enumName)
      if (enumExists) {
        return enumName
      }
    }

    // Check if it's a basic type
    const tsType = TypeConverter.MAVLINK_TO_TS_TYPES[type]
    if (tsType) {
      return tsType
    }

    // Check if it's an enum type
    const enumType = enums.find((e) => e.name === type)
    if (enumType) {
      return type
    }

    // Default to unknown
    return 'unknown'
  }

  private parseEnumValue(value: string): number | null {
    if (!value) return null

    // Handle binary values
    if (value.startsWith('0b')) {
      return parseInt(value.slice(2), 2)
    }

    // Handle hex values
    if (value.startsWith('0x')) {
      return parseInt(value.slice(2), 16)
    }

    // Handle power operations
    if (value.includes('**')) {
      const parts = value.split('**')
      if (parts.length === 2) {
        const base = parseInt(parts[0])
        const exp = parseInt(parts[1])
        return Math.pow(base, exp)
      }
    }

    // Handle regular integers
    const intValue = parseInt(value)
    return isNaN(intValue) ? null : intValue
  }

  private parseDescription(description: string): string[] {
    if (!description) return []

    return description
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  }
}
