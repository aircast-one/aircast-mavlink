import { MAVLinkGenerator, generateTypesFromXML } from '../../src/generator/generator'
import { GenerationOptions } from '../../src/types'
import { promises as fs } from 'fs'

// Mock the file system
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    readFile: jest.fn(),
  },
}))

// Mock node-fetch
jest.mock('node-fetch', () => ({
  __esModule: true,
  default: jest.fn(),
}))

describe('MAVLinkGenerator', () => {
  let generator: MAVLinkGenerator
  const mockOptions: GenerationOptions = {
    dialectName: 'test',
    outputFormat: 'separate',
    includeEnums: true,
    includeTypeGuards: true,
  }

  beforeEach(() => {
    generator = new MAVLinkGenerator()
    jest.clearAllMocks()
  })

  describe('generateFromFile', () => {
    const mockXMLContent = `<?xml version="1.0"?>
<mavlink>
  <version>3</version>
  <dialect>0</dialect>
  <enums>
    <enum name="MAV_STATE">
      <entry value="0" name="MAV_STATE_UNINIT"/>
    </enum>
  </enums>
  <messages>
    <message id="0" name="HEARTBEAT">
      <field type="uint8_t" name="type"/>
    </message>
  </messages>
</mavlink>`

    beforeEach(() => {
      ;(fs.readFile as jest.Mock).mockResolvedValue(mockXMLContent)
      ;(fs.mkdir as jest.Mock).mockResolvedValue(undefined)
      ;(fs.writeFile as jest.Mock).mockResolvedValue(undefined)
    })

    it('should generate files from XML file', async () => {
      await generator.generateFromFile('test.xml', './output', mockOptions)

      expect(fs.readFile).toHaveBeenCalledWith('test.xml', 'utf-8')
      expect(fs.mkdir).toHaveBeenCalledWith('./output', { recursive: true })
      // types, enums, parser, index + 1 message file
      expect(fs.writeFile).toHaveBeenCalledTimes(5)
    })

    it('should generate single file when specified', async () => {
      const singleFileOptions = { ...mockOptions, outputFormat: 'single' as const }

      await generator.generateFromFile('test.xml', './output', singleFileOptions)

      expect(fs.writeFile).toHaveBeenCalledTimes(1) // index file only
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('index.ts'),
        expect.any(String)
      )
    })

    it('should skip enums when disabled', async () => {
      const noEnumsOptions = { ...mockOptions, includeEnums: false }

      await generator.generateFromFile('test.xml', './output', noEnumsOptions)

      // types, parser, index + 1 message file (no enums)
      expect(fs.writeFile).toHaveBeenCalledTimes(4)
    })
  })

  describe('generateFromURL', () => {
    const mockFetch = require('node-fetch').default as jest.Mock
    const mockXMLContent = `<?xml version="1.0"?>
<mavlink>
  <version>3</version>
  <messages>
    <message id="0" name="HEARTBEAT">
      <field type="uint8_t" name="type"/>
    </message>
  </messages>
</mavlink>`

    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockXMLContent),
      })
      ;(fs.mkdir as jest.Mock).mockResolvedValue(undefined)
      ;(fs.writeFile as jest.Mock).mockResolvedValue(undefined)
    })

    it('should generate files from URL', async () => {
      await generator.generateFromURL('https://example.com/test.xml', './output', mockOptions)

      expect(mockFetch).toHaveBeenCalledWith('https://example.com/test.xml')
      expect(fs.mkdir).toHaveBeenCalledWith('./output', { recursive: true })
      expect(fs.writeFile).toHaveBeenCalled()
    })

    it('should handle fetch errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'Not Found',
      })

      await expect(
        generator.generateFromURL('https://example.com/test.xml', './output', mockOptions)
      ).rejects.toThrow('Failed to fetch')
    })
  })

  describe('error handling', () => {
    beforeEach(() => {
      ;(fs.readFile as jest.Mock).mockResolvedValue('invalid xml content')
    })

    it('should handle invalid XML gracefully', async () => {
      await expect(
        generator.generateFromFile('invalid.xml', './output', mockOptions)
      ).rejects.toThrow()
    })

    it('should handle file system errors', async () => {
      ;(fs.readFile as jest.Mock).mockRejectedValue(new Error('File not found'))

      await expect(
        generator.generateFromFile('nonexistent.xml', './output', mockOptions)
      ).rejects.toThrow('File not found')
    })
  })
})

describe('generateTypesFromXML', () => {
  const mockXMLContent = `<?xml version="1.0"?>
<mavlink>
  <version>3</version>
  <enums>
    <enum name="MAV_STATE">
      <entry value="0" name="MAV_STATE_UNINIT"/>
    </enum>
  </enums>
  <messages>
    <message id="0" name="HEARTBEAT">
      <field type="uint8_t" name="type"/>
    </message>
  </messages>
</mavlink>`

  const mockOptions: GenerationOptions = {
    dialectName: 'test',
    outputFormat: 'separate',
    includeEnums: true,
    includeTypeGuards: true,
  }

  it('should generate TypeScript from XML string', async () => {
    const result = await generateTypesFromXML(mockXMLContent, mockOptions)

    expect(result).toBeDefined()
    expect(typeof result).toBe('object')
    expect(result['types.ts']).toBeDefined()
    expect(result['enums.ts']).toBeDefined()
    expect(result['messages.ts']).toBeDefined()
    expect(result['index.ts']).toBeDefined()
  })

  it('should generate single file when specified', async () => {
    const singleFileOptions = { ...mockOptions, outputFormat: 'single' as const }
    const result = await generateTypesFromXML(mockXMLContent, singleFileOptions)

    expect(result).toBeDefined()
    expect(result['index.ts']).toBeDefined()
    expect(Object.keys(result)).toHaveLength(1)
  })

  it('should handle invalid XML', async () => {
    const invalidXML = '<invalid><xml></invalid>'

    await expect(generateTypesFromXML(invalidXML, mockOptions)).rejects.toThrow()
  })
})
