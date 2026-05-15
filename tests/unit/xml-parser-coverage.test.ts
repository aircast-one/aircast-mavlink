import { XMLParser } from '../../src/generator/xml-parser'
import { promises as fs } from 'fs'

// Mock xml2js
jest.mock('xml2js', () => ({
  parseString: jest.fn(),
}))

// Helper to access private methods for testing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getPrivateMethods = (parser: XMLParser): any => parser

describe('XMLParser Additional Coverage', () => {
  let parser: XMLParser

  beforeEach(() => {
    parser = new XMLParser()
    jest.clearAllMocks()
  })

  afterEach(() => {
    parser.reset()
    jest.clearAllMocks()
    jest.restoreAllMocks()
  })

  describe('processEnum edge cases', () => {
    test('should handle enum without $ property', () => {
      const enumData = {
        description: 'Test enum without $ property',
        entry: [],
      }

      const result = getPrivateMethods(parser).processEnum(enumData) as ReturnType<
        XMLParser['processEnum']
      >
      expect(result).toBeNull()
    })

    test('should handle enum with missing name', () => {
      const enumData = {
        $: { bitmask: 'true' }, // no name property
        description: 'Test enum',
      }

      const result = getPrivateMethods(parser).processEnum(enumData) as ReturnType<
        XMLParser['processEnum']
      >
      expect(result).toBeNull()
    })

    test('should handle enum with single entry (non-array)', () => {
      const enumData = {
        $: { name: 'SINGLE_ENTRY_ENUM' },
        description: 'Enum with single entry',
        entry: {
          $: { name: 'SINGLE_VALUE', value: '42' },
          description: 'Single entry description',
        },
      }

      const result = getPrivateMethods(parser).processEnum(enumData) as ReturnType<
        XMLParser['processEnum']
      >
      expect(result).toBeDefined()
      expect(result).not.toBeNull()
      expect(result!.name).toBe('SINGLE_ENTRY_ENUM')
      expect(result!.entries).toHaveLength(1)
      expect(result!.entries[0].value).toBe('42')
    })

    test('should handle enum entry without $ property', () => {
      const enumData = {
        $: { name: 'TEST_ENUM' },
        entry: [
          { $: { name: 'VALID', value: '1' } },
          { description: 'Invalid entry without $' }, // missing $ property
          { $: { name: 'ANOTHER_VALID', value: '2' } },
        ],
      }

      const result = getPrivateMethods(parser).processEnum(enumData) as ReturnType<
        XMLParser['processEnum']
      >
      expect(result).toBeDefined()
      expect(result).not.toBeNull()
      expect(result!.entries).toHaveLength(2) // Only valid entries
    })

    test('should handle enum entry with missing name or value', () => {
      const enumData = {
        $: { name: 'TEST_ENUM' },
        entry: [
          { $: { value: '1' } }, // missing name
          { $: { name: 'NO_VALUE' } }, // missing value
          { $: { name: 'VALID', value: '2' } },
        ],
      }

      const result = getPrivateMethods(parser).processEnum(enumData) as ReturnType<
        XMLParser['processEnum']
      >
      expect(result).toBeDefined()
      expect(result).not.toBeNull()
      expect(result!.entries).toHaveLength(1) // Only valid entry
      expect(result!.entries[0].name).toBe('VALID')
    })

    test('should use entry._ as description fallback', () => {
      const enumData = {
        $: { name: 'TEST_ENUM' },
        entry: {
          $: { name: 'ENTRY', value: '1' },
          _: 'Description from underscore property',
        },
      }

      const result = getPrivateMethods(parser).processEnum(enumData) as ReturnType<
        XMLParser['processEnum']
      >
      expect(result).toBeDefined()
      expect(result).not.toBeNull()
      expect(result!.entries[0].description).toBe('Description from underscore property')
    })

    test('should handle bitmask enum correctly', () => {
      const enumData = {
        $: { name: 'BITMASK_ENUM', bitmask: 'true' },
        description: 'Test bitmask enum',
        entry: [{ $: { name: 'BIT_0', value: '1' } }, { $: { name: 'BIT_1', value: '2' } }],
      }

      const result = getPrivateMethods(parser).processEnum(enumData) as ReturnType<
        XMLParser['processEnum']
      >
      expect(result).toBeDefined()
      expect(result).not.toBeNull()
      expect(result!.bitmask).toBe(true)
    })
  })

  describe('processMessage edge cases', () => {
    test('should handle message without $ property', () => {
      const messageData = {
        description: 'Test message without $ property',
        field: [],
      }

      const result = getPrivateMethods(parser).processMessage(messageData)
      expect(result).toBeNull()
    })

    test('should handle message with missing name or id', () => {
      const messageData1 = {
        $: { id: '123' }, // missing name
        description: 'Test message',
      }

      const result1 = getPrivateMethods(parser).processMessage(messageData1)
      expect(result1).toBeNull()

      const messageData2 = {
        $: { name: 'TEST_MESSAGE' }, // missing id
        description: 'Test message',
      }

      const result2 = getPrivateMethods(parser).processMessage(messageData2)
      expect(result2).toBeNull()
    })

    test('should handle message with single field (non-array)', () => {
      const messageData = {
        $: { name: 'SINGLE_FIELD_MESSAGE', id: '100' },
        description: 'Message with single field',
        field: {
          $: { name: 'single_field', type: 'uint32_t' },
          description: 'Single field description',
        },
      }

      const result = getPrivateMethods(parser).processMessage(messageData)
      expect(result).toBeDefined()
      expect(result.fields).toHaveLength(1)
      expect(result.fields[0].name).toBe('single_field')
    })

    test('should handle field as string or other invalid type', () => {
      const messageData = {
        $: { name: 'INVALID_FIELD_MESSAGE', id: '101' },
        field: [
          'invalid field string', // string instead of object
          { $: { name: 'valid_field', type: 'uint8_t' } },
          null, // null field
          undefined, // undefined field
        ],
      }

      const result = getPrivateMethods(parser).processMessage(messageData)
      expect(result).toBeDefined()
      expect(result.fields).toHaveLength(1) // Only valid field
      expect(result.fields[0].name).toBe('valid_field')
    })

    test('should handle field without $ property', () => {
      const messageData = {
        $: { name: 'TEST_MESSAGE', id: '102' },
        field: [
          { description: 'Field without $' }, // missing $ property
          { $: { name: 'valid_field', type: 'uint16_t' } },
        ],
      }

      const result = getPrivateMethods(parser).processMessage(messageData)
      expect(result).toBeDefined()
      expect(result.fields).toHaveLength(1) // Only valid field
    })

    test('should handle field with missing name or type', () => {
      const messageData = {
        $: { name: 'TEST_MESSAGE', id: '103' },
        field: [
          { $: { type: 'uint8_t' } }, // missing name
          { $: { name: 'no_type_field' } }, // missing type
          { $: { name: 'valid_field', type: 'uint32_t' } },
        ],
      }

      const result = getPrivateMethods(parser).processMessage(messageData)
      expect(result).toBeDefined()
      expect(result.fields).toHaveLength(1) // Only valid field
      expect(result.fields[0].name).toBe('valid_field')
    })

    test('should use field._ as description fallback', () => {
      const messageData = {
        $: { name: 'TEST_MESSAGE', id: '104' },
        field: {
          $: { name: 'test_field', type: 'uint8_t' },
          _: 'Description from underscore property',
        },
      }

      const result = getPrivateMethods(parser).processMessage(messageData)
      expect(result).toBeDefined()
      expect(result.fields[0].description).toBe('Description from underscore property')
    })

    test('should handle extensions with fallback when no raw XML', () => {
      const messageData = {
        $: { name: 'EXTENSION_MESSAGE', id: '105' },
        extensions: {}, // extensions marker present
        field: [
          // Create enough fields to exceed MAVLink v1 limit (255 bytes)
          ...Array(31)
            .fill(null)
            .map((_, i) => ({
              $: { name: `field_${i}`, type: 'uint64_t' }, // 8 bytes each, 31*8 = 248 bytes
            })),
          // These should be marked as extensions (would exceed 255 byte limit)
          { $: { name: 'extension_field_1', type: 'uint64_t' } }, // 248 + 8 = 256 bytes (exceeds 255)
          { $: { name: 'extension_field_2', type: 'uint32_t' } },
        ],
      }

      const result = getPrivateMethods(parser).processMessage(messageData)
      expect(result).toBeDefined()
      expect(result.fields).toHaveLength(33)

      // First 31 fields should not be extensions (31 * 8 = 248 bytes < 255)
      for (let i = 0; i < 31; i++) {
        expect(result.fields[i].extension).toBeFalsy()
      }

      // Last 2 fields should be marked as extensions
      expect(result.fields[31].extension).toBe(true)
      expect(result.fields[32].extension).toBe(true)
    })
  })

  describe('findExtensionFields edge cases', () => {
    test('should handle message not found in raw XML', () => {
      const rawXml = `<?xml version="1.0"?>
<mavlink>
  <messages>
    <message name="OTHER_MESSAGE" id="1">
      <field name="field1" type="uint8_t"/>
    </message>
  </messages>
</mavlink>`

      const result = (
        parser as unknown as Record<string, (...args: unknown[]) => unknown>
      ).findExtensionFields('NON_EXISTENT_MESSAGE', rawXml)
      expect(result).toEqual(new Set())
    })

    test('should handle extensions marker not found', () => {
      const rawXml = `<?xml version="1.0"?>
<mavlink>
  <messages>
    <message name="TEST_MESSAGE" id="1">
      <field name="field1" type="uint8_t"/>
      <field name="field2" type="uint16_t"/>
    </message>
  </messages>
</mavlink>`

      const result = (
        parser as unknown as Record<string, (...args: unknown[]) => unknown>
      ).findExtensionFields('TEST_MESSAGE', rawXml)
      expect(result).toEqual(new Set())
    })

    test('should handle regex parsing error', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

      // Create an invalid regex scenario by overriding match
      const originalMatch = String.prototype.match
      String.prototype.match = jest.fn().mockImplementation(function (this: string, regex) {
        if (regex.toString().includes('extensions')) {
          throw new Error('Regex error')
        }
        return originalMatch.call(this, regex)
      })

      const rawXml = `<?xml version="1.0"?>
<mavlink>
  <messages>
    <message name="TEST_MESSAGE" id="1">
      <field name="field1" type="uint8_t"/>
      <extensions/>
      <field name="extension_field" type="uint16_t"/>
    </message>
  </messages>
</mavlink>`

      const result = (
        parser as unknown as Record<string, (...args: unknown[]) => unknown>
      ).findExtensionFields('TEST_MESSAGE', rawXml)
      expect(result).toEqual(new Set())
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning: Failed to parse extension fields'),
        expect.any(Error)
      )

      // Restore original method
      String.prototype.match = originalMatch
      consoleSpy.mockRestore()
    })

    test('should correctly identify extension fields after marker', () => {
      const rawXml = `<?xml version="1.0"?>
<mavlink>
  <messages>
    <message name="TEST_MESSAGE" id="1">
      <field name="normal_field1" type="uint8_t"/>
      <field name="normal_field2" type="uint16_t"/>
      <extensions/>
      <field name="extension_field1" type="uint32_t"/>
      <field name="extension_field2" type="uint64_t"/>
    </message>
  </messages>
</mavlink>`

      const result = (
        parser as unknown as Record<string, (...args: unknown[]) => unknown>
      ).findExtensionFields('TEST_MESSAGE', rawXml)
      expect(result).toEqual(new Set(['extension_field1', 'extension_field2']))
    })

    test('should handle self-closing extensions tag', () => {
      const rawXml = `<?xml version="1.0"?>
<mavlink>
  <messages>
    <message name="TEST_MESSAGE" id="1">
      <field name="normal_field" type="uint8_t"/>
      <extensions />
      <field name="extension_field" type="uint16_t"/>
    </message>
  </messages>
</mavlink>`

      const result = (
        parser as unknown as Record<string, (...args: unknown[]) => unknown>
      ).findExtensionFields('TEST_MESSAGE', rawXml)
      expect(result).toEqual(new Set(['extension_field']))
    })
  })

  describe('getFieldSize and getSingleFieldSize edge cases', () => {
    test('should handle array field types', () => {
      expect(getPrivateMethods(parser).getFieldSize('uint8_t[10]')).toBe(10)
      expect(getPrivateMethods(parser).getFieldSize('uint16_t[5]')).toBe(10)
      expect(getPrivateMethods(parser).getFieldSize('uint32_t[3]')).toBe(12)
      expect(getPrivateMethods(parser).getFieldSize('uint64_t[2]')).toBe(16)
      expect(getPrivateMethods(parser).getFieldSize('float[4]')).toBe(16)
      expect(getPrivateMethods(parser).getFieldSize('double[2]')).toBe(16)
      expect(getPrivateMethods(parser).getFieldSize('char[20]')).toBe(20)
    })

    test('should handle single field types', () => {
      expect(getPrivateMethods(parser).getFieldSize('uint8_t')).toBe(1)
      expect(getPrivateMethods(parser).getFieldSize('int8_t')).toBe(1)
      expect(getPrivateMethods(parser).getFieldSize('char')).toBe(1)
      expect(getPrivateMethods(parser).getFieldSize('uint16_t')).toBe(2)
      expect(getPrivateMethods(parser).getFieldSize('int16_t')).toBe(2)
      expect(getPrivateMethods(parser).getFieldSize('uint32_t')).toBe(4)
      expect(getPrivateMethods(parser).getFieldSize('int32_t')).toBe(4)
      expect(getPrivateMethods(parser).getFieldSize('float')).toBe(4)
      expect(getPrivateMethods(parser).getFieldSize('uint64_t')).toBe(8)
      expect(getPrivateMethods(parser).getFieldSize('int64_t')).toBe(8)
      expect(getPrivateMethods(parser).getFieldSize('double')).toBe(8)
    })

    test('should throw for unknown types', () => {
      expect(() => getPrivateMethods(parser).getFieldSize('unknown_type')).toThrow(
        'Unknown MAVLink type for CRC computation: unknown_type'
      )
    })

    test('should handle array with non-numeric length gracefully', () => {
      expect(getPrivateMethods(parser).getFieldSize('uint8_t[invalid]')).toBe(NaN)
      expect(getPrivateMethods(parser).getFieldSize('uint8_t[]')).toBe(NaN)
    })
  })

  describe('processDefinition edge cases', () => {
    test('should handle undefined mavlink data', async () => {
      const result = await (
        parser as unknown as Record<string, (...args: unknown[]) => unknown>
      ).processDefinition(undefined, 'test-source')

      expect(result).toEqual({
        version: undefined,
        dialect: undefined,
        includes: [],
        enums: [],
        messages: [],
      })
    })

    test('should handle null mavlink data', async () => {
      const result = await (
        parser as unknown as Record<string, (...args: unknown[]) => unknown>
      ).processDefinition(null, 'test-source')

      expect(result).toEqual({
        version: undefined,
        dialect: undefined,
        includes: [],
        enums: [],
        messages: [],
      })
    })

    test('should handle dialect as string', async () => {
      const mavlinkData = {
        version: '3',
        dialect: '42', // string instead of number
        enums: {},
        messages: {},
      }

      const result = (await (
        parser as unknown as Record<string, (...args: unknown[]) => unknown>
      ).processDefinition(mavlinkData, 'test-source')) as any
      expect(result.dialect).toBe(42)
    })

    test('should handle missing optional properties', async () => {
      const mavlinkData = {
        // No version, dialect, includes, enums, or messages
      }

      const result = (await (
        parser as unknown as Record<string, (...args: unknown[]) => unknown>
      ).processDefinition(mavlinkData, 'test-source')) as any
      expect(result).toBeDefined()
      expect(result.version).toBeUndefined()
      expect(result.dialect).toBeUndefined()
      expect(result.enums).toHaveLength(0)
      expect(result.messages).toHaveLength(0)
    })
  })

  describe('parseXML with various XML structures', () => {
    test('should handle XML parsing error in callback', async () => {
      // Create a temporary test file
      const testFile = '/tmp/test-xml-error.xml'
      await fs.writeFile(testFile, '<test>content</test>')

      // Mock xml2js to return error
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const xml2js = require('xml2js')
      xml2js.parseString.mockImplementation((_str: any, _options: any, callback: any) => {
        callback(new Error('XML parsing failed'), null)
      })

      try {
        await expect(parser.parseFromFile(testFile)).rejects.toThrow('Failed to parse XML')
      } finally {
        // Cleanup
        jest.clearAllMocks()
        await fs.unlink(testFile).catch(() => {})
      }
    })

    test('should handle processDefinition throwing error', async () => {
      // Create a temporary test file
      const testFile = '/tmp/test-process-error.xml'
      const xmlContent = `<?xml version="1.0"?>
<mavlink>
  <version>3</version>
</mavlink>`
      await fs.writeFile(testFile, xmlContent)

      // Reset xml2js mock to work normally
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const xml2js = require('xml2js')
      const { parseString } = jest.requireActual('xml2js')
      xml2js.parseString.mockImplementation(parseString)

      // Mock processDefinition to throw
      const processSpy = jest
        .spyOn(getPrivateMethods(parser), 'processDefinition')
        .mockRejectedValueOnce(new Error('Process definition failed'))

      try {
        await expect(parser.parseFromFile(testFile)).rejects.toThrow('Process definition failed')
      } finally {
        processSpy.mockRestore()
        await fs.unlink(testFile).catch(() => {})
      }
    })
  })

  describe('Include URL resolution edge cases', () => {
    test('should handle include starting with http', () => {
      const result = getPrivateMethods(parser).resolveIncludeUrl(
        'http://example.com/include.xml',
        '/local/source.xml'
      )
      expect(result).toBe('http://example.com/include.xml')
    })

    test('should handle include starting with https', () => {
      const result = getPrivateMethods(parser).resolveIncludeUrl(
        'https://example.com/include.xml',
        'https://other.com/source.xml'
      )
      expect(result).toBe('https://example.com/include.xml')
    })

    test('should handle URL with query parameters', () => {
      const result = getPrivateMethods(parser).resolveIncludeUrl(
        'common.xml',
        'https://example.com/path/main.xml?version=1.0'
      )
      expect(result).toBe('https://example.com/path/common.xml?version=1.0')
    })

    test('should handle URL with fragment', () => {
      const result = getPrivateMethods(parser).resolveIncludeUrl(
        'common.xml',
        'https://example.com/path/main.xml#section'
      )
      expect(result).toBe('https://example.com/path/common.xml#section')
    })

    test('should handle deeply nested file paths', () => {
      const result = getPrivateMethods(parser).resolveIncludeUrl(
        '../../../common/base.xml',
        '/deep/nested/path/to/file.xml'
      )
      expect(result).toBe('/deep/common/base.xml')
    })
  })
})
