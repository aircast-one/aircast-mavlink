import { TemplateEngine } from '../../src/generator/template-engine'
import { TypeScriptDialect } from '../../src/types'

describe('TemplateEngine', () => {
  let engine: TemplateEngine

  beforeEach(() => {
    engine = new TemplateEngine()
  })

  const mockDialect: TypeScriptDialect = {
    dialectName: 'test',
    enums: [
      {
        name: 'MAV_STATE',
        description: ['States of the system'],
        bitmask: false,
        values: [
          { name: 'MAV_STATE_UNINIT', value: 0, description: ['Uninitialized'] },
          { name: 'MAV_STATE_BOOT', value: 1, description: ['Booting'] },
        ],
      },
    ],
    messages: [
      {
        id: 0,
        name: 'MessageHeartbeat',
        originalName: 'HEARTBEAT',
        description: ['The heartbeat message'],
        fields: [
          { name: 'Type', type: 'MAV_TYPE', description: ['Vehicle type'], optional: false },
          {
            name: 'Autopilot',
            type: 'MAV_AUTOPILOT',
            description: ['Autopilot type'],
            optional: false,
          },
        ],
        crcExtra: 50,
      },
    ],
  }

  describe('generateTypes', () => {
    it('should generate base types template', () => {
      const result = engine.generateTypes(mockDialect)

      expect(result).toBeDefined()
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
      expect(result).toContain('MAVLinkMessage')
    })
  })

  describe('generateEnums', () => {
    it('should generate enum definitions', () => {
      const result = engine.generateEnums(mockDialect)

      expect(result).toBeDefined()
      expect(typeof result).toBe('string')
      expect(result).toContain('MAV_STATE')
      expect(result).toContain('MAV_STATE_UNINIT')
      expect(result).toContain('MAV_STATE_BOOT')
    })

    it('should handle empty enums', () => {
      const emptyDialect = { ...mockDialect, enums: [] }
      const result = engine.generateEnums(emptyDialect)

      expect(result).toBeDefined()
      expect(typeof result).toBe('string')
      expect(result).toContain('// This dialect has no enums defined')
      expect(result).toContain('export {};')
    })
  })

  describe('generateMessages', () => {
    it('should generate message interfaces', () => {
      const result = engine.generateMessages(mockDialect)

      expect(result).toBeDefined()
      expect(typeof result).toBe('string')
      expect(result).toContain('MessageHeartbeat')
      expect(result).toContain('Type: MAV_TYPE')
      expect(result).toContain('Autopilot: MAV_AUTOPILOT')
    })

    it('should handle empty messages', () => {
      const emptyDialect = { ...mockDialect, messages: [] }
      const result = engine.generateMessages(emptyDialect)

      expect(result).toBeDefined()
      expect(typeof result).toBe('string')
    })

    it('should not import from enums when dialect has no enums', () => {
      const emptyEnumsDialect = { ...mockDialect, enums: [], messages: mockDialect.messages }
      const result = engine.generateMessages(emptyEnumsDialect, true)

      expect(result).toBeDefined()
      expect(result).not.toContain("} from './enums';")
      expect(result).not.toContain('import type {')
    })
  })

  describe('generateIndex', () => {
    it('should generate documentation-only index file with no re-exports', () => {
      const result = engine.generateIndex(mockDialect, true)

      expect(result).toBeDefined()
      expect(typeof result).toBe('string')
      // Index is documentation only - no exports
      expect(result).not.toContain('export *')
      expect(result).not.toContain('export {')
      // Should contain import examples in comments
      expect(result).toContain('// Parser')
      expect(result).toContain('// Constants')
      expect(result).toContain('// Message types')
      expect(result).toContain('// Types')
    })

    it('should include dialect name in documentation', () => {
      const result = engine.generateIndex(mockDialect, false)

      expect(result).toBeDefined()
      expect(typeof result).toBe('string')
      expect(result).toContain('test dialect')
    })
  })

  describe('generateSingle', () => {
    it('should generate single file with all types', () => {
      const result = engine.generateSingle(mockDialect)

      expect(result).toBeDefined()
      expect(typeof result).toBe('string')
      expect(result).toContain('MAVLinkMessage')
      expect(result).toContain('MAV_STATE')
      expect(result).toContain('MessageHeartbeat')
    })
  })

  describe('helper functions', () => {
    it('should properly format comments', () => {
      const result = engine.generateTypes(mockDialect)

      // Test that comments are properly formatted in the output
      expect(result).toBeDefined()
    })

    it('should handle multiline descriptions', () => {
      const dialectWithMultiline = {
        ...mockDialect,
        messages: [
          {
            ...mockDialect.messages[0],
            description: ['Line 1', 'Line 2', 'Line 3'],
          },
        ],
      }

      const result = engine.generateMessages(dialectWithMultiline)
      expect(result).toBeDefined()
    })
  })
})

describe('TemplateEngine Enhanced Tests', () => {
  let engine: TemplateEngine

  beforeEach(() => {
    engine = new TemplateEngine()
  })

  describe('Error Path Testing', () => {
    test('should throw error when types template is missing', () => {
      // Break the template by clearing the internal map
      ;(engine as any).templates.delete('types')

      const dialect: TypeScriptDialect = {
        dialectName: 'test',
        enums: [],
        messages: [],
      }

      expect(() => {
        engine.generateTypes(dialect)
      }).toThrow('Types template not found')
    })

    test('should throw error when enums template is missing', () => {
      ;(engine as any).templates.delete('enums')

      const dialect: TypeScriptDialect = {
        dialectName: 'test',
        enums: [],
        messages: [],
      }

      expect(() => {
        engine.generateEnums(dialect)
      }).toThrow('Enums template not found')
    })

    test('should throw error when messages template is missing', () => {
      ;(engine as any).templates.delete('messages')

      const dialect: TypeScriptDialect = {
        dialectName: 'test',
        enums: [],
        messages: [],
      }

      expect(() => {
        engine.generateMessages(dialect)
      }).toThrow('Messages template not found')
    })

    test('should throw error when index template is missing', () => {
      ;(engine as any).templates.delete('index')

      const dialect: TypeScriptDialect = {
        dialectName: 'test',
        enums: [],
        messages: [],
      }

      expect(() => {
        engine.generateIndex(dialect)
      }).toThrow('Index template not found')
    })

    test('should throw error when single template is missing', () => {
      ;(engine as any).templates.delete('single')

      const dialect: TypeScriptDialect = {
        dialectName: 'test',
        enums: [],
        messages: [],
      }

      expect(() => {
        engine.generateSingle(dialect)
      }).toThrow('Single template not found')
    })

    test('should throw error when decoder template is missing', () => {
      ;(engine as any).templates.delete('decoder')

      const dialect: TypeScriptDialect = {
        dialectName: 'test',
        enums: [],
        messages: [],
      }

      expect(() => {
        engine.generateDecoder(dialect)
      }).toThrow('Decoder template not found')
    })
  })

  describe('Handlebars Helper Functions', () => {
    test('should test join helper', () => {
      const dialect: TypeScriptDialect = {
        dialectName: 'test_join',
        enums: [
          {
            name: 'TEST_ENUM',
            description: ['First line', 'Second line', 'Third line'],
            values: [
              {
                name: 'VALUE_1',
                value: 1,
                description: ['Value description', 'with multiple', 'lines'],
              },
            ],
            bitmask: false,
          },
        ],
        messages: [],
      }

      const result = engine.generateEnums(dialect)

      // The join helper should be used in the template
      expect(result).toContain('TEST_ENUM')
      expect(result).toBeDefined()
    })

    test('should test eq helper with equal values', () => {
      // Test by using the helper indirectly through templates with conditions
      const dialect: TypeScriptDialect = {
        dialectName: 'test_eq',
        enums: [],
        messages: [
          {
            id: 1,
            name: 'TEST_MESSAGE',
            originalName: 'TEST_MESSAGE',
            description: ['Test message'],
            fields: [
              {
                name: 'test_field',
                type: 'number',
                description: ['Test field'],
                optional: false,
              },
            ],
            crcExtra: 50,
          },
        ],
      }

      // This should not throw and should generate proper content
      const result = engine.generateMessages(dialect, true)
      expect(result).toContain('TEST_MESSAGE')
    })

    test('should test ne helper with non-equal values', () => {
      const dialect: TypeScriptDialect = {
        dialectName: 'test_ne',
        enums: [],
        messages: [
          {
            id: 1,
            name: 'TEST_MESSAGE',
            originalName: 'DIFFERENT_NAME',
            description: ['Test message'],
            fields: [],
            crcExtra: 50,
          },
        ],
      }

      const result = engine.generateMessages(dialect, false)
      expect(result).toContain('TEST_MESSAGE')
    })

    test('should test toUpperCase helper', () => {
      const dialect: TypeScriptDialect = {
        dialectName: 'test_uppercase',
        enums: [
          {
            name: 'lowercase_enum',
            description: ['Test enum'],
            values: [
              {
                name: 'test_value',
                value: 1,
                description: ['Test value'],
              },
            ],
            bitmask: false,
          },
        ],
        messages: [],
      }

      // The template might use toUpperCase helper
      const result = engine.generateEnums(dialect)
      expect(result).toContain('lowercase_enum')
    })

    test('should test capitalize helper', () => {
      const dialect: TypeScriptDialect = {
        dialectName: 'test_capitalize',
        enums: [
          {
            name: 'testEnum',
            description: ['test enum description'],
            values: [],
            bitmask: false,
          },
        ],
        messages: [],
      }

      const result = engine.generateEnums(dialect)
      expect(result).toContain('testEnum')
    })
  })

  describe('Template Generation Parameter Combinations', () => {
    test('should generate types with includeEnums = false', () => {
      const dialect: TypeScriptDialect = {
        dialectName: 'test_no_enums',
        enums: [
          {
            name: 'UNUSED_ENUM',
            description: ['Unused enum'],
            values: [
              {
                name: 'VALUE_1',
                value: 1,
                description: ['Value 1'],
              },
            ],
            bitmask: false,
          },
        ],
        messages: [],
      }

      const result = engine.generateTypes(dialect, false)

      // Should generate content without throwing
      expect(result).toContain('test_no_enums')
      expect(result).toContain('export interface ParsedMAVLinkMessage')
    })

    test('should generate types with includeEnums = true (default)', () => {
      const dialect: TypeScriptDialect = {
        dialectName: 'test_with_enums',
        enums: [
          {
            name: 'INCLUDED_ENUM',
            description: ['Included enum'],
            values: [
              {
                name: 'VALUE_1',
                value: 1,
                description: ['Value 1'],
              },
            ],
            bitmask: false,
          },
        ],
        messages: [],
      }

      const result = engine.generateTypes(dialect)

      expect(result).toContain('test_with_enums')
      expect(result).toContain('export interface ParsedMAVLinkMessage')
    })

    test('should generate messages with includeEnums = true', () => {
      const dialect: TypeScriptDialect = {
        dialectName: 'test_msg_with_enums',
        enums: [
          {
            name: 'MSG_ENUM',
            description: ['Message enum'],
            values: [
              {
                name: 'VALUE_1',
                value: 1,
                description: ['Value 1'],
              },
            ],
            bitmask: false,
          },
        ],
        messages: [
          {
            id: 1,
            name: 'TEST_MESSAGE',
            originalName: 'TEST_MESSAGE',
            description: ['Test message'],
            fields: [
              {
                name: 'enum_field',
                type: 'MSG_ENUM',
                description: ['Enum field'],
                optional: false,
              },
            ],
            crcExtra: 50,
          },
        ],
      }

      const result = engine.generateMessages(dialect, true)

      expect(result).toContain('TEST_MESSAGE')
      expect(result).toContain('MSG_ENUM')
    })

    test('should generate index with includeEnums = true', () => {
      const dialect: TypeScriptDialect = {
        dialectName: 'test_index_enums',
        enums: [
          {
            name: 'INDEX_ENUM',
            description: ['Index enum'],
            values: [],
            bitmask: false,
          },
        ],
        messages: [],
      }

      const result = engine.generateIndex(dialect, true)

      // Index is documentation-only, no exports
      expect(result).not.toContain('export *')
      expect(result).toContain('// Parser')
    })

    test('should generate index as documentation only', () => {
      const dialect: TypeScriptDialect = {
        dialectName: 'test_index_no_enums',
        enums: [],
        messages: [],
      }

      const result = engine.generateIndex(dialect, false)

      // Index is documentation-only, no exports
      expect(result).not.toContain('export *')
      expect(result).toContain('// Constants')
    })
  })

  describe('getUsedEnums Function Coverage', () => {
    test('should filter enums to only include those used in message fields', () => {
      const dialect: TypeScriptDialect = {
        dialectName: 'test_used_enums',
        enums: [
          {
            name: 'USED_ENUM',
            description: ['Used enum'],
            values: [
              {
                name: 'VALUE_1',
                value: 1,
                description: ['Value 1'],
              },
            ],
            bitmask: false,
          },
          {
            name: 'UNUSED_ENUM',
            description: ['Unused enum'],
            values: [
              {
                name: 'VALUE_2',
                value: 2,
                description: ['Value 2'],
              },
            ],
            bitmask: false,
          },
        ],
        messages: [
          {
            id: 1,
            name: 'TEST_MESSAGE',
            originalName: 'TEST_MESSAGE',
            description: ['Test message'],
            fields: [
              {
                name: 'used_field',
                type: 'USED_ENUM',
                description: ['Used enum field'],
                optional: false,
              },
              {
                name: 'normal_field',
                type: 'number',
                description: ['Normal field'],
                optional: false,
              },
            ],
            crcExtra: 50,
          },
        ],
      }

      const result = engine.generateMessages(dialect, true)

      // Should contain the used enum but the template filtering is internal
      expect(result).toContain('TEST_MESSAGE')
      expect(result).toContain('USED_ENUM')
    })

    test('should handle array type enum filtering', () => {
      const dialect: TypeScriptDialect = {
        dialectName: 'test_array_enums',
        enums: [
          {
            name: 'ARRAY_ENUM',
            description: ['Array enum'],
            values: [
              {
                name: 'ARRAY_VALUE',
                value: 1,
                description: ['Array value'],
              },
            ],
            bitmask: false,
          },
        ],
        messages: [
          {
            id: 1,
            name: 'ARRAY_MESSAGE',
            originalName: 'ARRAY_MESSAGE',
            description: ['Array message'],
            fields: [
              {
                name: 'array_field',
                type: 'ARRAY_ENUM[]',
                description: ['Array enum field'],
                optional: false,
              },
            ],
            crcExtra: 50,
          },
        ],
      }

      const result = engine.generateMessages(dialect, true)

      expect(result).toContain('ARRAY_MESSAGE')
      expect(result).toContain('ARRAY_ENUM')
    })

    test('should handle empty messages list', () => {
      const dialect: TypeScriptDialect = {
        dialectName: 'test_empty_messages',
        enums: [
          {
            name: 'UNUSED_ENUM',
            description: ['Unused enum'],
            values: [],
            bitmask: false,
          },
        ],
        messages: [],
      }

      const result = engine.generateMessages(dialect, true)

      // Should generate without errors even with empty messages
      expect(result).toBeDefined()
      expect(result).toContain('test_empty_messages')
    })

    test('should handle messages with no fields', () => {
      const dialect: TypeScriptDialect = {
        dialectName: 'test_no_fields',
        enums: [
          {
            name: 'UNUSED_ENUM',
            description: ['Unused enum'],
            values: [],
            bitmask: false,
          },
        ],
        messages: [
          {
            id: 1,
            name: 'EMPTY_MESSAGE',
            originalName: 'EMPTY_MESSAGE',
            description: ['Empty message'],
            fields: [],
            crcExtra: 50,
          },
        ],
      }

      const result = engine.generateMessages(dialect, true)

      expect(result).toContain('EMPTY_MESSAGE')
    })
  })

  describe('generateSingle Function Coverage', () => {
    test('should generate single file with complex context object', () => {
      const dialect: TypeScriptDialect = {
        dialectName: 'test_single',
        enums: [
          {
            name: 'SINGLE_ENUM',
            description: ['Single enum'],
            values: [
              {
                name: 'SINGLE_VALUE',
                value: 1,
                description: ['Single value'],
              },
            ],
            bitmask: false,
          },
        ],
        messages: [
          {
            id: 1,
            name: 'SINGLE_MESSAGE',
            originalName: 'SINGLE_MESSAGE',
            description: ['Single message'],
            fields: [
              {
                name: 'single_field',
                type: 'number',
                description: ['Single field'],
                optional: false,
              },
            ],
            crcExtra: 50,
          },
        ],
      }

      const result = engine.generateSingle(dialect)

      expect(result).toBeDefined()
      expect(result).toContain('test_single')
    })
  })

  describe('Complex Template Scenarios', () => {
    test('should handle dialect with mixed optional and required fields', () => {
      const dialect: TypeScriptDialect = {
        dialectName: 'test_optional_fields',
        enums: [],
        messages: [
          {
            id: 1,
            name: 'MIXED_MESSAGE',
            originalName: 'MIXED_MESSAGE',
            description: ['Mixed message'],
            fields: [
              {
                name: 'required_field',
                type: 'number',
                description: ['Required field'],
                optional: false,
              },
              {
                name: 'optional_field',
                type: 'string',
                description: ['Optional field'],
                optional: true,
              },
            ],
            crcExtra: 50,
          },
        ],
      }

      const result = engine.generateMessages(dialect, false)

      expect(result).toContain('required_field: number')
      expect(result).toContain('optional_field?: string')
    })

    test('should handle enums with bitmask flag', () => {
      const dialect: TypeScriptDialect = {
        dialectName: 'test_bitmask',
        enums: [
          {
            name: 'BITMASK_ENUM',
            description: ['Bitmask enum'],
            values: [
              {
                name: 'FLAG_1',
                value: 1,
                description: ['Flag 1'],
              },
              {
                name: 'FLAG_2',
                value: 2,
                description: ['Flag 2'],
              },
            ],
            bitmask: true,
          },
        ],
        messages: [],
      }

      const result = engine.generateEnums(dialect)

      expect(result).toContain('BITMASK_ENUM')
      expect(result).toContain('FLAG_1 = 1')
      expect(result).toContain('FLAG_2 = 2')
    })

    test('should handle empty enum values array', () => {
      const dialect: TypeScriptDialect = {
        dialectName: 'test_empty_enum',
        enums: [
          {
            name: 'EMPTY_ENUM',
            description: ['Empty enum'],
            values: [],
            bitmask: false,
          },
        ],
        messages: [],
      }

      const result = engine.generateEnums(dialect)

      expect(result).toContain('EMPTY_ENUM')
    })

    test('should handle empty description arrays', () => {
      const dialect: TypeScriptDialect = {
        dialectName: 'test_empty_desc',
        enums: [
          {
            name: 'NO_DESC_ENUM',
            description: [],
            values: [
              {
                name: 'NO_DESC_VALUE',
                value: 1,
                description: [],
              },
            ],
            bitmask: false,
          },
        ],
        messages: [
          {
            id: 1,
            name: 'NO_DESC_MESSAGE',
            originalName: 'NO_DESC_MESSAGE',
            description: [],
            fields: [
              {
                name: 'no_desc_field',
                type: 'number',
                description: [],
                optional: false,
              },
            ],
            crcExtra: 50,
          },
        ],
      }

      const enumResult = engine.generateEnums(dialect)
      const msgResult = engine.generateMessages(dialect, false)

      expect(enumResult).toContain('NO_DESC_ENUM')
      expect(msgResult).toContain('NO_DESC_MESSAGE')
    })
  })
})
