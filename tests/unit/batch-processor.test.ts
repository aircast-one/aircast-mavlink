import { BatchProcessor } from '../../src/generator/batch-processor'

const mockFetch = jest.fn()
global.fetch = mockFetch as unknown as typeof fetch

// Mock the file system
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    writeFile: jest.fn(),
  },
}))

describe('BatchProcessor', () => {
  let processor: BatchProcessor

  beforeEach(() => {
    processor = new BatchProcessor()
    jest.clearAllMocks()
    global.fetch = mockFetch as unknown as typeof fetch
  })

  describe('processAllDialects', () => {
    const mockDialectList = [
      { name: 'common.xml' },
      { name: 'minimal.xml' },
      { name: 'ardupilotmega.xml' },
    ]

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
      // Mock GitHub API response
      mockFetch.mockImplementation((url: string) => {
        if (
          url &&
          typeof url === 'string' &&
          url.includes('github.com/repos/mavlink/mavlink/contents')
        ) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockDialectList),
          })
        }
        // Mock dialect XML content
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(mockXMLContent),
        })
      })

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require('fs')
      fs.promises.mkdir.mockResolvedValue(undefined)
      fs.promises.writeFile.mockResolvedValue(undefined)
    })

    it('should process all available dialects', async () => {
      const options = {
        outputDir: './output',
        dialectFormat: 'separate' as const,
        includeEnums: true,
        includeTypeGuards: true,
      }

      await processor.processAllDialects(options)

      // Should fetch dialect list from GitHub
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('github.com/repos/mavlink/mavlink/contents')
      )

      // Should fetch each dialect XML
      expect(mockFetch).toHaveBeenCalledTimes(4) // 1 for list + 3 for dialects
    })

    it('should handle GitHub API errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'API Error',
      })

      const options = {
        outputDir: './output',
        dialectFormat: 'separate' as const,
        includeEnums: true,
        includeTypeGuards: true,
      }

      await expect(processor.processAllDialects(options)).rejects.toThrow()
    })
  })

  describe('processSpecificDialects', () => {
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

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require('fs')
      fs.promises.mkdir.mockResolvedValue(undefined)
      fs.promises.writeFile.mockResolvedValue(undefined)
    })

    it('should process specific dialects', async () => {
      const dialectNames = ['common', 'minimal']
      const options = {
        outputDir: './output',
        dialectFormat: 'separate' as const,
        includeEnums: true,
        includeTypeGuards: true,
      }

      await processor.processSpecificDialects(dialectNames, options)

      // Should fetch XML for each specified dialect
      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('common.xml'))
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('minimal.xml'))
    })

    it('should handle empty dialect list', async () => {
      const options = {
        outputDir: './output',
        dialectFormat: 'separate' as const,
        includeEnums: true,
        includeTypeGuards: true,
      }

      await processor.processSpecificDialects([], options)

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should handle dialect fetch errors gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'Not Found',
      })

      const options = {
        outputDir: './output',
        dialectFormat: 'separate' as const,
        includeEnums: true,
        includeTypeGuards: true,
      }

      // Should not throw, but continue processing other dialects
      await expect(
        processor.processSpecificDialects(['nonexistent'], options)
      ).resolves.not.toThrow()
    })
  })

  describe('generatePackageJson', () => {
    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require('fs')
      fs.promises.writeFile.mockResolvedValue(undefined)
    })

    it('should generate package.json file', async () => {
      await processor.generatePackageJson('./output')

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require('fs')
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('package.json'),
        expect.stringContaining('"name": "mavlink-types"')
      )
    })

    it('should generate tsconfig.json file', async () => {
      await processor.generatePackageJson('./output')

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require('fs')
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('tsconfig.json'),
        expect.stringContaining('"compilerOptions"')
      )
    })
  })
})
