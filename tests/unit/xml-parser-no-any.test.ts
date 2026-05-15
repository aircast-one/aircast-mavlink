import { XMLParser } from '../../src/generator/xml-parser'
import { promises as fs } from 'fs'
import path from 'path'

const mockFetch = jest.fn()

beforeEach(() => {
  global.fetch = mockFetch as unknown as typeof fetch
})

describe('XMLParser - Coverage without any', () => {
  let parser: XMLParser
  const testDir = path.join(__dirname, 'test-xml-files')

  beforeEach(async () => {
    parser = new XMLParser()
    // Ensure test directory exists
    await fs.mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    parser.reset()
    jest.clearAllMocks()
    // Clean up test files
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch (e) {
      // Ignore cleanup errors
    }
  })

  describe('parseFromFile tests', () => {
    test('should parse valid XML file', async () => {
      const xmlContent = `<?xml version="1.0"?>
<mavlink>
  <version>3</version>
  <dialect>0</dialect>
  <messages>
    <message id="1" name="TEST_MESSAGE">
      <description>Test message</description>
      <field type="uint8_t" name="field1">Field 1</field>
    </message>
  </messages>
</mavlink>`

      const filePath = path.join(testDir, 'test.xml')
      await fs.writeFile(filePath, xmlContent)

      const result = await parser.parseFromFile(filePath)

      expect(result).toBeDefined()
      expect(result.version).toBe('3')
      expect(result.messages).toBeDefined()
      expect(result.messages!.length).toBe(1)
      expect(result.messages![0].name).toBe('TEST_MESSAGE')
    })

    test('should handle XML without mavlink root', async () => {
      const xmlContent = `<?xml version="1.0"?>
<root>
  <other>content</other>
</root>`

      const filePath = path.join(testDir, 'no-mavlink.xml')
      await fs.writeFile(filePath, xmlContent)

      const result = await parser.parseFromFile(filePath)

      expect(result).toBeDefined()
      expect(result.version).toBeUndefined()
      expect(result.dialect).toBeUndefined()
      expect(result.enums).toEqual([])
      expect(result.messages).toEqual([])
    })

    test('should handle file not found', async () => {
      const nonExistentPath = path.join(testDir, 'does-not-exist.xml')

      await expect(parser.parseFromFile(nonExistentPath)).rejects.toThrow()
    })

    test('should handle invalid XML', async () => {
      const invalidXml = '<invalid><xml>'
      const filePath = path.join(testDir, 'invalid.xml')
      await fs.writeFile(filePath, invalidXml)

      await expect(parser.parseFromFile(filePath)).rejects.toThrow()
    })
  })

  describe('parseFromURL tests', () => {
    test('should parse XML from URL', async () => {
      // Using mockFetch from top of file
      const xmlContent = `<?xml version="1.0"?>
<mavlink>
  <version>3</version>
  <messages>
    <message id="1" name="URL_MESSAGE">
      <field type="uint16_t" name="field1">Field 1</field>
    </message>
  </messages>
</mavlink>`

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue(xmlContent),
      })

      const result = await parser.parseFromURL('https://example.com/test.xml')

      expect(result).toBeDefined()
      expect(result.messages).toBeDefined()
      expect(result.messages!.length).toBe(1)
      expect(result.messages![0].name).toBe('URL_MESSAGE')
    })

    test('should handle URL fetch failure', async () => {
      // Using mockFetch from top of file
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      })

      await expect(parser.parseFromURL('https://example.com/404.xml')).rejects.toThrow(
        'Failed to fetch'
      )
    })

    test('should handle network error', async () => {
      // Using mockFetch from top of file
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await expect(parser.parseFromURL('https://example.com/error.xml')).rejects.toThrow(
        'Network error'
      )
    })
  })

  describe('Complex XML parsing', () => {
    test('should parse enums correctly', async () => {
      const xmlContent = `<?xml version="1.0"?>
<mavlink>
  <enums>
    <enum name="TEST_ENUM">
      <description>Test enum</description>
      <entry value="0" name="VALUE_0">
        <description>Value 0</description>
      </entry>
      <entry value="1" name="VALUE_1">Value 1</entry>
    </enum>
    <enum name="BITMASK_ENUM" bitmask="true">
      <entry value="1" name="FLAG_1"/>
      <entry value="2" name="FLAG_2"/>
    </enum>
  </enums>
</mavlink>`

      const filePath = path.join(testDir, 'enums.xml')
      await fs.writeFile(filePath, xmlContent)

      const result = await parser.parseFromFile(filePath)

      expect(result.enums).toBeDefined()
      expect(result.enums!.length).toBe(2)

      const testEnum = result.enums![0]
      expect(testEnum.name).toBe('TEST_ENUM')
      expect(testEnum.bitmask).toBe(false)
      expect(testEnum.entries.length).toBe(2)

      const bitmaskEnum = result.enums![1]
      expect(bitmaskEnum.name).toBe('BITMASK_ENUM')
      expect(bitmaskEnum.bitmask).toBe(true)
    })

    test('should parse messages with extensions', async () => {
      const xmlContent = `<?xml version="1.0"?>
<mavlink>
  <messages>
    <message id="1" name="EXT_MESSAGE">
      <description>Message with extensions</description>
      <field type="uint8_t" name="core_field">Core field</field>
      <extensions/>
      <field type="uint16_t" name="ext_field">Extension field</field>
    </message>
  </messages>
</mavlink>`

      const filePath = path.join(testDir, 'extensions.xml')
      await fs.writeFile(filePath, xmlContent)

      const result = await parser.parseFromFile(filePath)

      expect(result.messages).toBeDefined()
      expect(result.messages!.length).toBe(1)

      const message = result.messages![0]
      expect(message.fields.length).toBe(2)
      expect(message.fields[0].extension).toBeFalsy()
      expect(message.fields[1].extension).toBe(true)
    })

    test('should handle includes', async () => {
      // Using mockFetch from top of file

      const mainXml = `<?xml version="1.0"?>
<mavlink>
  <include>common.xml</include>
  <messages>
    <message id="1" name="MAIN_MESSAGE">
      <field type="uint8_t" name="field1">Field 1</field>
    </message>
  </messages>
</mavlink>`

      const includedXml = `<?xml version="1.0"?>
<mavlink>
  <messages>
    <message id="2" name="INCLUDED_MESSAGE">
      <field type="uint16_t" name="field2">Field 2</field>
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

      expect(result.messages).toBeDefined()
      expect(result.messages!.length).toBe(2)

      const messageNames = result.messages!.map((m) => m.name)
      expect(messageNames).toContain('MAIN_MESSAGE')
      expect(messageNames).toContain('INCLUDED_MESSAGE')
    })

    test('should handle failed includes gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()
      // Using mockFetch from top of file

      const mainXml = `<?xml version="1.0"?>
<mavlink>
  <include>missing.xml</include>
  <messages>
    <message id="1" name="MAIN_MESSAGE">
      <field type="uint8_t" name="field1">Field 1</field>
    </message>
  </messages>
</mavlink>`

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: jest.fn().mockResolvedValue(mainXml),
        })
        .mockRejectedValueOnce(new Error('Include not found'))

      const result = await parser.parseFromURL('https://example.com/main.xml')

      expect(result.messages).toBeDefined()
      expect(result.messages!.length).toBe(1)
      expect(result.messages![0].name).toBe('MAIN_MESSAGE')

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning: Failed to process include'),
        expect.any(Error)
      )

      consoleSpy.mockRestore()
    })
  })

  describe('Edge cases', () => {
    test('should handle array fields', async () => {
      const xmlContent = `<?xml version="1.0"?>
<mavlink>
  <messages>
    <message id="1" name="ARRAY_MESSAGE">
      <field type="uint8_t[10]" name="byte_array">Byte array</field>
      <field type="float[3]" name="vector">Vector</field>
    </message>
  </messages>
</mavlink>`

      const filePath = path.join(testDir, 'arrays.xml')
      await fs.writeFile(filePath, xmlContent)

      const result = await parser.parseFromFile(filePath)

      const message = result.messages![0]
      expect(message.fields[0].type).toBe('uint8_t[10]')
      expect(message.fields[1].type).toBe('float[3]')
    })

    test('should handle empty elements', async () => {
      const xmlContent = `<?xml version="1.0"?>
<mavlink>
  <version></version>
  <enums>
    <enum name="EMPTY_ENUM">
      <description></description>
    </enum>
  </enums>
  <messages>
    <message id="1" name="EMPTY_DESC">
      <description></description>
      <field type="uint8_t" name="field1"></field>
    </message>
  </messages>
</mavlink>`

      const filePath = path.join(testDir, 'empty-elements.xml')
      await fs.writeFile(filePath, xmlContent)

      const result = await parser.parseFromFile(filePath)

      expect(result).toBeDefined()
      expect(result.enums![0].description).toBe('')
      expect(result.messages![0].description).toBe('')
      expect(result.messages![0].fields[0].description).toBe('')
    })

    test('should handle reset functionality', async () => {
      // Using mockFetch from top of file
      const xmlContent = `<?xml version="1.0"?>
<mavlink>
  <include>common.xml</include>
</mavlink>`

      const includedXml = `<?xml version="1.0"?>
<mavlink>
  <messages>
    <message id="1" name="COMMON">
      <field type="uint8_t" name="field">Field</field>
    </message>
  </messages>
</mavlink>`

      // First parse
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: jest.fn().mockResolvedValue(xmlContent),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: jest.fn().mockResolvedValue(includedXml),
        })

      await parser.parseFromURL('https://example.com/main.xml')

      // Reset parser
      parser.reset()

      // Second parse - should fetch include again
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: jest.fn().mockResolvedValue(xmlContent),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: jest.fn().mockResolvedValue(includedXml),
        })

      const result = await parser.parseFromURL('https://example.com/main.xml')

      expect(result.messages).toBeDefined()
      expect(mockFetch).toHaveBeenCalledTimes(4) // 2 calls per parse
    })
  })
})
