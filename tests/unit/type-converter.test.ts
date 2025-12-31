import { TypeConverter } from '../../src/generator/type-converter'
import { MAVLinkDialectDefinition } from '../../src/types'

describe('TypeConverter', () => {
  let converter: TypeConverter

  beforeEach(() => {
    converter = new TypeConverter()
  })

  describe('convert', () => {
    const mockDialectDefinition: MAVLinkDialectDefinition = {
      version: '3',
      dialect: 0,
      includes: [],
      enums: [
        {
          name: 'MAV_STATE',
          description: 'States of the system',
          bitmask: false,
          entries: [
            { name: 'MAV_STATE_UNINIT', value: '0', description: 'Uninitialized' },
            { name: 'MAV_STATE_BOOT', value: '1', description: 'Booting' },
          ],
        },
      ],
      messages: [
        {
          id: 0,
          name: 'HEARTBEAT',
          description: 'The heartbeat message',
          fields: [
            { name: 'type', type: 'uint8_t', enum: 'MAV_TYPE', description: 'Vehicle type' },
            {
              name: 'autopilot',
              type: 'uint8_t',
              enum: 'MAV_AUTOPILOT',
              description: 'Autopilot type',
            },
            { name: 'base_mode', type: 'uint8_t', description: 'Base mode' },
            { name: 'custom_mode', type: 'uint32_t', description: 'Custom mode' },
            {
              name: 'system_status',
              type: 'uint8_t',
              enum: 'MAV_STATE',
              description: 'System status',
            },
          ],
        },
      ],
    }

    it('should convert dialect definition to TypeScript', () => {
      const result = converter.convert(mockDialectDefinition, 'test')

      expect(result).toBeDefined()
      expect(result.dialectName).toBe('test')
      expect(result.enums).toHaveLength(1)
      expect(result.messages).toHaveLength(1)

      const enum_ = result.enums[0]
      expect(enum_.name).toBe('MAV_STATE')
      expect(enum_.values).toHaveLength(2)
      expect(enum_.values[0].name).toBe('MAV_STATE_UNINIT')
      expect(enum_.values[0].value).toBe(0)

      const message = result.messages[0]
      expect(message.name).toBe('Heartbeat')
      expect(message.originalName).toBe('HEARTBEAT')
      expect(message.fields).toHaveLength(5)
    })

    it('should handle empty dialect definition', () => {
      const emptyDefinition: MAVLinkDialectDefinition = {
        enums: [],
        messages: [],
      }

      const result = converter.convert(emptyDefinition, 'empty')

      expect(result.dialectName).toBe('empty')
      expect(result.enums).toHaveLength(0)
      expect(result.messages).toHaveLength(0)
    })
  })

  describe('convertFieldType', () => {
    it('should convert basic MAVLink types to TypeScript types', () => {
      const testCases = [
        { input: 'uint8_t', expected: 'number' },
        { input: 'int32_t', expected: 'number' },
        { input: 'float', expected: 'number' },
        { input: 'double', expected: 'number' },
        { input: 'char[16]', expected: 'string' },
        { input: 'uint8_t[4]', expected: 'number[]' },
      ]

      testCases.forEach(({ input, expected }) => {
        const result = (converter as any).convertFieldType(input, undefined, [])
        expect(result).toBe(expected)
      })
    })

    it('should handle enum types', () => {
      const mockEnums = [
        {
          name: 'MAV_STATE',
          description: [],
          values: [],
          bitmask: false,
        },
      ]

      const result = (converter as any).convertFieldType('uint8_t', 'MAV_STATE', mockEnums)
      expect(result).toBe('MAV_STATE')
    })

    it('should handle unknown types', () => {
      const result = (converter as any).convertFieldType('unknown_type', undefined, [])
      expect(result).toBe('unknown')
    })
  })

  describe('convertEnum', () => {
    it('should convert enum definition to TypeScript enum', () => {
      const mockEnumDef = {
        name: 'MAV_STATE',
        description: 'States of the system',
        bitmask: false,
        entries: [
          { name: 'MAV_STATE_UNINIT', value: '0', description: 'Uninitialized' },
          { name: 'MAV_STATE_BOOT', value: '1', description: 'Booting' },
        ],
      }

      const result = (converter as any).convertEnum(mockEnumDef)

      expect(result).toBeDefined()
      expect(result.name).toBe('MAV_STATE')
      expect(result.values).toHaveLength(2)
      expect(result.values[0].name).toBe('MAV_STATE_UNINIT')
      expect(result.values[0].value).toBe(0)
    })

    it('should handle null enum definition', () => {
      const result = (converter as any).convertEnum(null)

      expect(result).toBeNull()
    })
  })

  describe('Enhanced Edge Case Coverage', () => {
    describe('convert method edge cases', () => {
      test('should handle definition without enums array', () => {
        const definition: MAVLinkDialectDefinition = {
          messages: [
            {
              id: 1,
              name: 'TEST_MESSAGE',
              description: 'Test message',
              fields: [{ name: 'field1', type: 'uint8_t', description: 'Test field' }],
            },
          ],
        }

        const result = converter.convert(definition, 'test')
        expect(result.enums).toHaveLength(0)
        expect(result.messages).toHaveLength(1)
      })

      test('should handle definition without messages array', () => {
        const definition: MAVLinkDialectDefinition = {
          enums: [
            {
              name: 'TEST_ENUM',
              description: 'Test enum',
              bitmask: false,
              entries: [{ name: 'VALUE_1', value: '1', description: 'First value' }],
            },
          ],
        }

        const result = converter.convert(definition, 'test')
        expect(result.enums).toHaveLength(1)
        expect(result.messages).toHaveLength(0)
      })

      test('should merge duplicate enums correctly', () => {
        const definition: MAVLinkDialectDefinition = {
          enums: [
            {
              name: 'DUPLICATE_ENUM',
              description: 'First description',
              bitmask: false,
              entries: [{ name: 'VALUE_1', value: '1', description: 'First value' }],
            },
            {
              name: 'DUPLICATE_ENUM',
              description: 'Second description',
              bitmask: false,
              entries: [{ name: 'VALUE_2', value: '2', description: 'Second value' }],
            },
          ],
        }

        const result = converter.convert(definition, 'test')

        expect(result.enums).toHaveLength(1)
        expect(result.enums[0].name).toBe('DUPLICATE_ENUM')
        expect(result.enums[0].values).toHaveLength(2)
        expect(result.enums[0].description).toEqual(['First description', 'Second description'])
      })

      test('should not duplicate values when merging enums', () => {
        const definition: MAVLinkDialectDefinition = {
          enums: [
            {
              name: 'SAME_ENUM',
              description: 'Test enum',
              bitmask: false,
              entries: [{ name: 'SAME_VALUE', value: '1', description: 'First occurrence' }],
            },
            {
              name: 'SAME_ENUM',
              description: 'Test enum again',
              bitmask: false,
              entries: [
                { name: 'SAME_VALUE', value: '1', description: 'Second occurrence' },
                { name: 'DIFFERENT_VALUE', value: '2', description: 'Different value' },
              ],
            },
          ],
        }

        const result = converter.convert(definition, 'test')

        expect(result.enums).toHaveLength(1)
        expect(result.enums[0].values).toHaveLength(2)
        expect(result.enums[0].values.find((v) => v.name === 'SAME_VALUE')).toBeDefined()
        expect(result.enums[0].values.find((v) => v.name === 'DIFFERENT_VALUE')).toBeDefined()
      })
    })

    describe('convertEnum edge cases', () => {
      test('should return null for undefined enum definition', () => {
        const result = (converter as any).convertEnum(undefined)
        expect(result).toBeNull()
      })

      test('should return null for enum without name', () => {
        const enumDef = {
          name: '',
          description: 'No name enum',
          bitmask: false,
          entries: [{ name: 'VALUE_1', value: '1', description: 'Test value' }],
        }

        const result = (converter as any).convertEnum(enumDef)
        expect(result).toBeNull()
      })

      test('should return null for enum without entries', () => {
        const enumDef = {
          name: 'EMPTY_ENUM',
          description: 'Empty enum',
          bitmask: false,
          entries: [],
        }

        const result = (converter as any).convertEnum(enumDef)
        expect(result).toBeNull()
      })

      test('should return null for enum with null entries', () => {
        const enumDef = {
          name: 'NULL_ENTRIES_ENUM',
          description: 'Null entries enum',
          bitmask: false,
          entries: null as any,
        }

        const result = (converter as any).convertEnum(enumDef)
        expect(result).toBeNull()
      })

      test('should handle enum with bitmask flag', () => {
        const enumDef = {
          name: 'BITMASK_ENUM',
          description: 'Bitmask enum',
          bitmask: true,
          entries: [
            { name: 'FLAG_1', value: '1', description: 'First flag' },
            { name: 'FLAG_2', value: '2', description: 'Second flag' },
          ],
        }

        const result = (converter as any).convertEnum(enumDef)
        expect(result).toBeDefined()
        expect(result.bitmask).toBe(true)
      })

      test('should filter out enum values that fail parsing', () => {
        const enumDef = {
          name: 'MIXED_VALUES_ENUM',
          description: 'Mixed values enum',
          bitmask: false,
          entries: [
            { name: 'VALID_VALUE', value: '1', description: 'Valid' },
            { name: 'INVALID_VALUE', value: 'not-a-number', description: 'Invalid' },
            { name: 'ANOTHER_VALID', value: '2', description: 'Another valid' },
          ],
        }

        const result = (converter as any).convertEnum(enumDef)
        expect(result).toBeDefined()
        expect(result.values).toHaveLength(2)
        expect(result.values[0].name).toBe('VALID_VALUE')
        expect(result.values[1].name).toBe('ANOTHER_VALID')
      })
    })

    describe('convertMessage edge cases', () => {
      test('should return null for message without name', () => {
        const messageDef = {
          id: 1,
          name: '',
          description: 'No name message',
          fields: [],
        }

        const result = (converter as any).convertMessage(messageDef, [])
        expect(result).toBeNull()
      })

      test('should return null for message without fields', () => {
        const messageDef = {
          id: 1,
          name: 'NO_FIELDS_MESSAGE',
          description: 'No fields message',
          fields: null as any,
        }

        const result = (converter as any).convertMessage(messageDef, [])
        expect(result).toBeNull()
      })

      test('should handle message with extension fields', () => {
        const messageDef = {
          id: 1,
          name: 'EXTENSION_MESSAGE',
          description: 'Message with extensions',
          fields: [
            { name: 'normal_field', type: 'uint8_t', description: 'Normal field' },
            {
              name: 'extension_field',
              type: 'uint16_t',
              description: 'Extension field',
              extension: true,
            },
          ],
        }

        const result = (converter as any).convertMessage(messageDef, [])
        expect(result).toBeDefined()
        expect(result.fields).toHaveLength(2)
        expect(result.fields[0].optional).toBe(false)
        expect(result.fields[1].optional).toBe(true)
        expect(result.fields[1].extension).toBe(true)
      })

      test('should filter out null fields from convertField', () => {
        const messageDef = {
          id: 1,
          name: 'FILTERED_MESSAGE',
          description: 'Message with null fields',
          fields: [
            { name: 'valid_field', type: 'uint8_t', description: 'Valid field' },
            { name: '', type: 'uint8_t', description: 'Invalid field - no name' },
            { name: 'another_valid', type: 'uint16_t', description: 'Another valid' },
          ],
        }

        const result = (converter as any).convertMessage(messageDef, [])
        expect(result).toBeDefined()
        expect(result.fields).toHaveLength(2)
        // Fields are sorted by size: uint16_t (2 bytes) before uint8_t (1 byte)
        expect(result.fields[0].name).toBe('another_valid')
        expect(result.fields[1].name).toBe('valid_field')
      })
    })

    describe('convertField edge cases', () => {
      test('should return null for field without name', () => {
        const fieldDef = {
          name: '',
          type: 'uint8_t',
          description: 'No name field',
        }

        const result = (converter as any).convertField(fieldDef, [])
        expect(result).toBeNull()
      })

      test('should return null for field without type', () => {
        const fieldDef = {
          name: 'no_type_field',
          type: '',
          description: 'No type field',
        }

        const result = (converter as any).convertField(fieldDef, [])
        expect(result).toBeNull()
      })

      test('should handle array field types correctly', () => {
        const fieldDef = {
          name: 'array_field',
          type: 'uint8_t[16]',
          description: 'Array field',
        }

        const result = (converter as any).convertField(fieldDef, [])
        expect(result).toBeDefined()
        expect(result.arrayLength).toBe(16)
        expect(result.originalType).toBe('uint8_t')
        expect(result.type).toBe('number[]')
      })

      test('should handle char array as string', () => {
        const fieldDef = {
          name: 'string_field',
          type: 'char[50]',
          description: 'String field',
        }

        const result = (converter as any).convertField(fieldDef, [])
        expect(result).toBeDefined()
        expect(result.type).toBe('string')
        expect(result.arrayLength).toBe(50)
      })
    })

    describe('type conversion edge cases', () => {
      test('should handle unknown enum in field type', () => {
        const fieldDef = {
          name: 'enum_field',
          type: 'uint8_t',
          enum: 'UNKNOWN_ENUM',
          description: 'Enum field with unknown enum',
        }

        const result = (converter as any).convertField(fieldDef, [])
        expect(result).toBeDefined()
        expect(result.type).toBe('number') // Falls back to base type
      })

      test('should handle enum type that exists in enums list', () => {
        const enums = [
          {
            name: 'KNOWN_ENUM',
            description: [],
            values: [],
            bitmask: false,
          },
        ]

        const fieldDef = {
          name: 'enum_field',
          type: 'uint8_t',
          enum: 'KNOWN_ENUM',
          description: 'Enum field',
        }

        const result = (converter as any).convertField(fieldDef, enums)
        expect(result).toBeDefined()
        expect(result.type).toBe('KNOWN_ENUM')
      })

      test('should recognize enum type by name in field type', () => {
        const enums = [
          {
            name: 'DIRECT_ENUM_TYPE',
            description: [],
            values: [],
            bitmask: false,
          },
        ]

        const fieldDef = {
          name: 'enum_field',
          type: 'DIRECT_ENUM_TYPE',
          description: 'Direct enum type field',
        }

        const result = (converter as any).convertField(fieldDef, enums)
        expect(result).toBeDefined()
        expect(result.type).toBe('DIRECT_ENUM_TYPE')
      })

      test('should default to unknown for unrecognized types', () => {
        const fieldDef = {
          name: 'unknown_field',
          type: 'completely_unknown_type',
          description: 'Unknown type field',
        }

        const result = (converter as any).convertField(fieldDef, [])
        expect(result).toBeDefined()
        expect(result.type).toBe('unknown')
      })
    })

    describe('parseEnumValue edge cases', () => {
      test('should return null for empty value', () => {
        const result = (converter as any).parseEnumValue('')
        expect(result).toBeNull()
      })

      test('should return null for null value', () => {
        const result = (converter as any).parseEnumValue(null)
        expect(result).toBeNull()
      })

      test('should handle binary values', () => {
        const result = (converter as any).parseEnumValue('0b1010')
        expect(result).toBe(10)
      })

      test('should handle hexadecimal values', () => {
        const result = (converter as any).parseEnumValue('0xFF')
        expect(result).toBe(255)
      })

      test('should handle power operations', () => {
        const result = (converter as any).parseEnumValue('2**8')
        expect(result).toBe(256)
      })

      test('should handle invalid power operations', () => {
        const result = (converter as any).parseEnumValue('2**')
        expect(isNaN(result) || result === null).toBe(true)
      })

      test('should handle multiple power signs', () => {
        const result = (converter as any).parseEnumValue('2**3**2')
        // Implementation only handles first ** operation
        expect(typeof result).toBe('number')
      })

      test('should return null for non-numeric values', () => {
        const result = (converter as any).parseEnumValue('not-a-number')
        expect(result).toBeNull()
      })

      test('should handle regular integers', () => {
        const result = (converter as any).parseEnumValue('42')
        expect(result).toBe(42)
      })

      test('should handle negative integers', () => {
        const result = (converter as any).parseEnumValue('-42')
        expect(result).toBe(-42)
      })
    })

    describe('getBaseTypeSize edge cases', () => {
      test('should warn about unknown types and return 1', () => {
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

        const result = (converter as any).getBaseTypeSize('unknown_mavlink_type')

        expect(result).toBe(1)
        expect(consoleSpy).toHaveBeenCalledWith(
          'Unknown MAVLink type for size calculation: unknown_mavlink_type'
        )

        consoleSpy.mockRestore()
      })

      test('should handle all known MAVLink types correctly', () => {
        const testCases = [
          { type: 'double', expectedSize: 8 },
          { type: 'uint64_t', expectedSize: 8 },
          { type: 'int64_t', expectedSize: 8 },
          { type: 'float', expectedSize: 4 },
          { type: 'uint32_t', expectedSize: 4 },
          { type: 'int32_t', expectedSize: 4 },
          { type: 'uint16_t', expectedSize: 2 },
          { type: 'int16_t', expectedSize: 2 },
          { type: 'uint8_t', expectedSize: 1 },
          { type: 'int8_t', expectedSize: 1 },
          { type: 'char', expectedSize: 1 },
          { type: 'uint8_t_mavlink_version', expectedSize: 1 },
        ]

        testCases.forEach(({ type, expectedSize }) => {
          const result = (converter as any).getBaseTypeSize(type)
          expect(result).toBe(expectedSize)
        })
      })
    })

    describe('sortFieldsForWireFormat', () => {
      test('should sort fields by size correctly', () => {
        const fields = [
          { name: 'small_field', type: 'uint8_t', description: 'Small field' },
          { name: 'large_field', type: 'double', description: 'Large field' },
          { name: 'medium_field', type: 'uint32_t', description: 'Medium field' },
        ]

        const result = (converter as any).sortFieldsForWireFormat(fields)

        expect(result).toHaveLength(3)
        expect(result[0].name).toBe('large_field') // 8 bytes
        expect(result[1].name).toBe('medium_field') // 4 bytes
        expect(result[2].name).toBe('small_field') // 1 byte
      })

      test('should handle array types in sorting', () => {
        // Per MAVLink spec: arrays are sorted by ELEMENT type size, not total array size
        // See: https://mavlink.io/en/guide/serialization.html#field_reordering
        const fields = [
          { name: 'single_byte', type: 'uint8_t', description: 'Single byte' },
          { name: 'byte_array', type: 'uint8_t[10]', description: 'Byte array' },
          { name: 'int_array', type: 'uint32_t[2]', description: 'Int array' },
        ]

        const result = (converter as any).sortFieldsForWireFormat(fields)

        expect(result).toHaveLength(3)
        expect(result[0].name).toBe('int_array') // uint32_t element = 4 bytes
        expect(result[1].name).toBe('single_byte') // uint8_t = 1 byte (original order preserved)
        expect(result[2].name).toBe('byte_array') // uint8_t element = 1 byte (original order preserved)
      })

      test('should maintain original order for fields of same size', () => {
        const fields = [
          { name: 'first_byte', type: 'uint8_t', description: 'First byte' },
          { name: 'second_byte', type: 'uint8_t', description: 'Second byte' },
          { name: 'third_byte', type: 'int8_t', description: 'Third byte' },
        ]

        const result = (converter as any).sortFieldsForWireFormat(fields)

        expect(result).toHaveLength(3)
        expect(result[0].name).toBe('first_byte')
        expect(result[1].name).toBe('second_byte')
        expect(result[2].name).toBe('third_byte')
      })
    })

    describe('parseDescription', () => {
      test('should handle undefined description', () => {
        const result = (converter as any).parseDescription(undefined)
        expect(result).toEqual([])
      })

      test('should handle empty string description', () => {
        const result = (converter as any).parseDescription('')
        expect(result).toEqual([])
      })

      test('should split multiline descriptions', () => {
        const result = (converter as any).parseDescription('Line 1\nLine 2\nLine 3')
        expect(result).toEqual(['Line 1', 'Line 2', 'Line 3'])
      })

      test('should handle single line description', () => {
        const result = (converter as any).parseDescription('Single line description')
        expect(result).toEqual(['Single line description'])
      })
    })

    describe('convertMessageName', () => {
      test('should convert UPPER_CASE to PascalCase', () => {
        const result = (converter as any).convertMessageName('TEST_MESSAGE_NAME')
        expect(result).toBe('TestMessageName')
      })

      test('should handle single word', () => {
        const result = (converter as any).convertMessageName('HEARTBEAT')
        expect(result).toBe('Heartbeat')
      })

      test('should handle lowercase input', () => {
        const result = (converter as any).convertMessageName('test_message')
        expect(result).toBe('TestMessage')
      })
    })

    describe('convertFieldName', () => {
      test('should keep snake_case format', () => {
        const result = (converter as any).convertFieldName('TEST_FIELD_NAME')
        expect(result).toBe('test_field_name')
      })

      test('should convert to lowercase', () => {
        const result = (converter as any).convertFieldName('UPPERCASE_FIELD')
        expect(result).toBe('uppercase_field')
      })

      test('should handle already lowercase input', () => {
        const result = (converter as any).convertFieldName('already_lowercase')
        expect(result).toBe('already_lowercase')
      })
    })
  })
})
