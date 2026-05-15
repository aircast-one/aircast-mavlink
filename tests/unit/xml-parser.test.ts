import { XMLParser } from '../../src/generator/xml-parser'
import { promises as fs, existsSync } from 'fs'
import * as path from 'path'

const mockFetch = jest.fn()

beforeEach(() => {
  global.fetch = mockFetch as unknown as typeof fetch
})

// Helper to access private methods for testing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getPrivateMethods = (parser: XMLParser): any => parser

describe('XMLParser', () => {
  let parser: XMLParser

  beforeEach(() => {
    parser = new XMLParser()
  })

  describe('parseXML', () => {
    const mockXMLContent = `<?xml version="1.0"?>
<mavlink>
  <version>3</version>
  <dialect>0</dialect>
  <enums>
    <enum name="MAV_STATE">
      <description>States of the system</description>
      <entry value="0" name="MAV_STATE_UNINIT">
        <description>Uninitialized system</description>
      </entry>
      <entry value="1" name="MAV_STATE_BOOT">
        <description>System is booting</description>
      </entry>
    </enum>
  </enums>
  <messages>
    <message id="0" name="HEARTBEAT">
      <description>The heartbeat message</description>
      <field type="uint8_t" name="type" enum="MAV_TYPE">Vehicle type</field>
      <field type="uint8_t" name="autopilot" enum="MAV_AUTOPILOT">Autopilot type</field>
    </message>
  </messages>
</mavlink>`

    it('should parse XML content successfully', async () => {
      // Mock fs.readFile to return the XML content
      const mockReadFile = jest.fn().mockResolvedValue(mockXMLContent)
      jest.spyOn(fs, 'readFile').mockImplementation(mockReadFile)

      const definition = await parser.parseFromFile('test.xml')

      expect(definition).toBeDefined()
      expect(typeof definition).toBe('object')

      // Cleanup
      mockReadFile.mockRestore()
    })

    it('should handle invalid XML gracefully', async () => {
      const invalidXML = '<invalid><xml></invalid>'

      // Mock fs.readFile to return invalid XML
      jest.doMock('fs', () => ({
        promises: {
          readFile: jest.fn().mockResolvedValue(invalidXML),
        },
      }))

      await expect(parser.parseFromFile('invalid.xml')).rejects.toThrow()
    })
  })

  describe('processEnum', () => {
    it('should process enum definitions correctly', () => {
      const mockEnumData = {
        $: { name: 'MAV_STATE', bitmask: 'false' },
        description: 'States of the system',
        entry: [
          { $: { name: 'MAV_STATE_UNINIT', value: '0' }, description: 'Uninitialized' },
          { $: { name: 'MAV_STATE_BOOT', value: '1' }, description: 'Booting' },
        ],
      }

      // Access private method through type assertion
      const result = getPrivateMethods(parser).processEnum(mockEnumData)

      expect(result).toBeDefined()
      expect(result).not.toBeNull()
      expect(result.name).toBe('MAV_STATE')
      expect(result.entries).toHaveLength(2)
      expect(result.entries[0].name).toBe('MAV_STATE_UNINIT')
      expect(result.entries[0].value).toBe('0')
    })

    it('should return null for invalid enum data', () => {
      const invalidEnumData = { description: 'Invalid enum' }

      const result = getPrivateMethods(parser).processEnum(invalidEnumData)

      expect(result).toBeNull()
    })
  })

  describe('processMessage', () => {
    it('should process message definitions correctly', () => {
      const mockMessageData = {
        $: { id: '0', name: 'HEARTBEAT' },
        description: 'The heartbeat message',
        field: [
          { $: { name: 'type', type: 'uint8_t', enum: 'MAV_TYPE' }, _: 'Vehicle type' },
          { $: { name: 'autopilot', type: 'uint8_t', enum: 'MAV_AUTOPILOT' }, _: 'Autopilot type' },
        ],
      }

      const result = getPrivateMethods(parser).processMessage(mockMessageData)

      expect(result).toBeDefined()
      expect(result.name).toBe('HEARTBEAT')
      expect(result.id).toBe(0)
      expect(result.fields).toHaveLength(2)
      expect(result.fields[0].name).toBe('type')
      expect(result.fields[0].type).toBe('uint8_t')
      expect(result.fields[0].enum).toBe('MAV_TYPE')
    })

    it('should return null for invalid message data', () => {
      const invalidMessageData = { description: 'Invalid message' }

      const result = getPrivateMethods(parser).processMessage(invalidMessageData)

      expect(result).toBeNull()
    })
  })

  afterEach(() => {
    parser.reset()
  })

  describe('Enhanced Edge Case Coverage', () => {
    const testOutputDir = path.join(__dirname, '../test-xml-output')

    beforeEach(() => {
      parser = new XMLParser()
    })

    afterEach(async () => {
      // Clean up test files
      if (existsSync(testOutputDir)) {
        await fs.rm(testOutputDir, { recursive: true, force: true })
      }
      parser.reset()
      jest.clearAllMocks()
    })

    describe('parseFromFile edge cases', () => {
      test('should handle file that does not exist', async () => {
        await expect(parser.parseFromFile('/nonexistent/path/file.xml')).rejects.toThrow()
      })

      test('should handle invalid XML content', async () => {
        const invalidXmlPath = path.join(__dirname, 'invalid-test.xml')
        const invalidXml = `<?xml version="1.0"?>
<mavlink>
  <unclosed-tag>
  <another-unclosed-tag>
</mavlink>`

        await fs.writeFile(invalidXmlPath, invalidXml)

        try {
          await expect(parser.parseFromFile(invalidXmlPath)).rejects.toThrow()
        } finally {
          if (existsSync(invalidXmlPath)) {
            await fs.unlink(invalidXmlPath)
          }
        }
      })

      test('should handle XML without mavlink root element', async () => {
        const noMavlinkPath = path.join(__dirname, 'no-mavlink-test.xml')
        const noMavlinkXml = `<?xml version="1.0"?>
<root>
  <other>content</other>
</root>`

        await fs.writeFile(noMavlinkPath, noMavlinkXml)

        try {
          await expect(parser.parseFromFile(noMavlinkPath)).rejects.toThrow()
        } finally {
          if (existsSync(noMavlinkPath)) {
            await fs.unlink(noMavlinkPath)
          }
        }
      })
    })

    describe('parseFromURL edge cases', () => {
      test('should handle URL fetch failure', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network error'))

        await expect(parser.parseFromURL('https://example.com/nonexistent.xml')).rejects.toThrow(
          'Network error'
        )
      })

      test('should handle non-OK HTTP response', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          statusText: 'Not Found',
        })

        await expect(parser.parseFromURL('https://example.com/notfound.xml')).rejects.toThrow(
          'Failed to fetch'
        )
      })

      test('should handle invalid XML from URL', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          text: jest.fn().mockResolvedValue('invalid xml content <unclosed>'),
        })

        await expect(parser.parseFromURL('https://example.com/invalid.xml')).rejects.toThrow()
      })

      test('should successfully parse valid XML from URL', async () => {
        const validXml = `<?xml version="1.0"?>
<mavlink>
  <version>3</version>
  <messages>
    <message name="TEST_MESSAGE" id="1">
      <description>Test message</description>
      <field name="test_field" type="uint8_t">Test field</field>
    </message>
  </messages>
</mavlink>`

        mockFetch.mockResolvedValueOnce({
          ok: true,
          text: jest.fn().mockResolvedValue(validXml),
        })

        const result = await parser.parseFromURL('https://example.com/valid.xml')
        expect(result).toBeDefined()
        expect(result.messages).toHaveLength(1)
      })
    })

    describe('processDefinition with includes', () => {
      test('should handle single include string', async () => {
        // Using mockFetch from top of file

        // Mock the main XML with include
        const mainXml = `<?xml version="1.0"?>
<mavlink>
  <version>3</version>
  <include>common.xml</include>
  <messages>
    <message name="MAIN_MESSAGE" id="1">
      <field name="main_field" type="uint8_t">Main field</field>
    </message>
  </messages>
</mavlink>`

        // Mock the included XML
        const includedXml = `<?xml version="1.0"?>
<mavlink>
  <version>3</version>
  <messages>
    <message name="INCLUDED_MESSAGE" id="2">
      <field name="included_field" type="uint16_t">Included field</field>
    </message>
  </messages>
</mavlink>`

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            text: jest.fn().mockResolvedValue(mainXml),
          })
          .mockResolvedValueOnce({
            ok: true,
            text: jest.fn().mockResolvedValue(includedXml),
          })

        const result = await parser.parseFromURL('https://example.com/main.xml')

        expect(result.messages).toHaveLength(2)
        expect(result.messages!.some((m) => m.name === 'MAIN_MESSAGE')).toBe(true)
        expect(result.messages!.some((m) => m.name === 'INCLUDED_MESSAGE')).toBe(true)
      })

      test('should handle array of includes', async () => {
        // Using mockFetch from top of file

        const mainXml = `<?xml version="1.0"?>
<mavlink>
  <version>3</version>
  <include>first.xml</include>
  <include>second.xml</include>
  <messages>
    <message name="MAIN_MESSAGE" id="1">
      <field name="main_field" type="uint8_t">Main field</field>
    </message>
  </messages>
</mavlink>`

        const firstInclude = `<?xml version="1.0"?>
<mavlink>
  <enums>
    <enum name="FIRST_ENUM">
      <entry name="VALUE_1" value="1">First value</entry>
    </enum>
  </enums>
</mavlink>`

        const secondInclude = `<?xml version="1.0"?>
<mavlink>
  <enums>
    <enum name="SECOND_ENUM">
      <entry name="VALUE_2" value="2">Second value</entry>
    </enum>
  </enums>
</mavlink>`

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            text: jest.fn().mockResolvedValue(mainXml),
          })
          .mockResolvedValueOnce({
            ok: true,
            text: jest.fn().mockResolvedValue(firstInclude),
          })
          .mockResolvedValueOnce({
            ok: true,
            text: jest.fn().mockResolvedValue(secondInclude),
          })

        const result = await parser.parseFromURL('https://example.com/main.xml')

        expect(result.enums).toHaveLength(2)
        expect(result.enums!.some((e) => e.name === 'FIRST_ENUM')).toBe(true)
        expect(result.enums!.some((e) => e.name === 'SECOND_ENUM')).toBe(true)
      })

      test('should handle failed include with warning', async () => {
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()
        // Using mockFetch from top of file

        const mainXml = `<?xml version="1.0"?>
<mavlink>
  <version>3</version>
  <include>failing-include.xml</include>
  <messages>
    <message name="MAIN_MESSAGE" id="1">
      <field name="main_field" type="uint8_t">Main field</field>
    </message>
  </messages>
</mavlink>`

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            text: jest.fn().mockResolvedValue(mainXml),
          })
          .mockRejectedValueOnce(new Error('Include fetch failed'))

        const result = await parser.parseFromURL('https://example.com/main.xml')

        expect(result.messages).toHaveLength(1)
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Warning: Failed to process include'),
          expect.any(Error)
        )

        consoleSpy.mockRestore()
      })

      test('should not reprocess same URL twice', async () => {
        // Using mockFetch from top of file

        const mainXml = `<?xml version="1.0"?>
<mavlink>
  <version>3</version>
  <include>common.xml</include>
  <include>common.xml</include>
  <messages>
    <message name="MAIN_MESSAGE" id="1">
      <field name="main_field" type="uint8_t">Main field</field>
    </message>
  </messages>
</mavlink>`

        const commonXml = `<?xml version="1.0"?>
<mavlink>
  <messages>
    <message name="COMMON_MESSAGE" id="2">
      <field name="common_field" type="uint16_t">Common field</field>
    </message>
  </messages>
</mavlink>`

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            text: jest.fn().mockResolvedValue(mainXml),
          })
          .mockResolvedValueOnce({
            ok: true,
            text: jest.fn().mockResolvedValue(commonXml),
          })

        const result = await parser.parseFromURL('https://example.com/main.xml')

        expect(result.messages).toHaveLength(2)
        expect(mockFetch).toHaveBeenCalledTimes(2) // Should not fetch common.xml twice
      })
    })

    describe('resolveIncludeUrl', () => {
      test('should resolve relative include from file source', () => {
        const result = (
          parser as unknown as Record<string, (...args: unknown[]) => unknown>
        ).resolveIncludeUrl('common.xml', '/path/to/main.xml')
        expect(result).toBe('/path/to/common.xml')
      })

      test('should resolve relative include from URL source', () => {
        const result = (
          parser as unknown as Record<string, (...args: unknown[]) => unknown>
        ).resolveIncludeUrl('common.xml', 'https://example.com/dialects/main.xml')
        expect(result).toBe('https://example.com/dialects/common.xml')
      })

      test('should handle absolute URL include', () => {
        const result = (
          parser as unknown as Record<string, (...args: unknown[]) => unknown>
        ).resolveIncludeUrl('https://other.com/other.xml', 'https://example.com/main.xml')
        expect(result).toBe('https://other.com/other.xml')
      })

      test('should handle include with path separators', () => {
        const result = (
          parser as unknown as Record<string, (...args: unknown[]) => unknown>
        ).resolveIncludeUrl('subdirectory/include.xml', 'https://example.com/main/main.xml')
        expect(result).toBe('https://example.com/main/subdirectory/include.xml')
      })
    })

    describe('reset functionality', () => {
      test('should clear processed URLs on reset', async () => {
        // Using mockFetch from top of file
        mockFetch.mockClear() // Clear previous calls

        const xmlContent = `<?xml version="1.0"?>
<mavlink>
  <include>common.xml</include>
  <messages>
    <message name="TEST" id="1">
      <field name="field" type="uint8_t">Test field</field>
    </message>
  </messages>
</mavlink>`

        const commonXml = `<?xml version="1.0"?>
<mavlink>
  <messages>
    <message name="COMMON" id="2">
      <field name="common_field" type="uint8_t">Common field</field>
    </message>
  </messages>
</mavlink>`

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            text: jest.fn().mockResolvedValue(xmlContent),
          })
          .mockResolvedValueOnce({
            ok: true,
            text: jest.fn().mockResolvedValue(commonXml),
          })
          .mockResolvedValueOnce({
            ok: true,
            text: jest.fn().mockResolvedValue(xmlContent),
          })
          .mockResolvedValueOnce({
            ok: true,
            text: jest.fn().mockResolvedValue(commonXml),
          })

        // First parse
        await parser.parseFromURL('https://example.com/main.xml')

        // Reset and parse again - should fetch includes again
        parser.reset()
        const result = await parser.parseFromURL('https://example.com/main.xml')

        expect(result.messages).toHaveLength(2)
        expect(mockFetch).toHaveBeenCalledTimes(4) // Should fetch includes again after reset
      })
    })

    describe('edge cases and error handling', () => {
      test('should handle extension fields marked with "extensions" element', async () => {
        const xmlContent = `<?xml version="1.0"?>
<mavlink>
  <messages>
    <message name="EXTENSION_TEST" id="1">
      <field name="normal_field" type="uint8_t">Normal field</field>
      <extensions/>
      <field name="extension_field" type="uint16_t">Extension field</field>
    </message>
  </messages>
</mavlink>`

        mockFetch.mockResolvedValueOnce({
          ok: true,
          text: jest.fn().mockResolvedValue(xmlContent),
        })

        const result = await parser.parseFromURL('https://example.com/extensions.xml')

        expect(result.messages).toHaveLength(1)
        expect(result.messages![0].fields).toHaveLength(2)
        expect(result.messages![0].fields[0].name).toBe('normal_field')
        expect(result.messages![0].fields[0].extension).toBeFalsy()
        expect(result.messages![0].fields[1].name).toBe('extension_field')
        expect(result.messages![0].fields[1].extension).toBe(true)
      })

      test('should handle invalid field objects gracefully', async () => {
        const xmlContent = `<?xml version="1.0"?>
<mavlink>
  <messages>
    <message name="INVALID_FIELDS" id="1">
      <field name="valid_field" type="uint8_t">Valid field</field>
      <field type="uint8_t">Field without name</field>
      <field name="field_without_type">Field without type</field>
    </message>
  </messages>
</mavlink>`

        mockFetch.mockResolvedValueOnce({
          ok: true,
          text: jest.fn().mockResolvedValue(xmlContent),
        })

        const result = await parser.parseFromURL('https://example.com/invalid-fields.xml')

        expect(result.messages).toHaveLength(1)
        expect(result.messages![0].fields).toHaveLength(1) // Only valid field should be included
        expect(result.messages![0].fields[0].name).toBe('valid_field')
      })
    })
  })
})
