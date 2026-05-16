import { promises as fs } from 'fs'
import { join } from 'path'
import { MAVLinkGenerator } from './generator'
import { GenerationOptions } from '../types'
import pkg from '../../package.json'

export interface BatchProcessorOptions {
  outputDir: string
  dialectFormat: 'single' | 'separate'
  includeEnums: boolean
  includeTypeGuards: boolean
}

export class BatchProcessor {
  private generator: MAVLinkGenerator
  private static readonly MAVLINK_COMMIT = (pkg as unknown as { mavlinkCommit: string })
    .mavlinkCommit
  private static readonly MAVLINK_DIALECTS_URL = `https://api.github.com/repos/mavlink/mavlink/contents/message_definitions/v1.0?ref=${BatchProcessor.MAVLINK_COMMIT}`
  private static readonly MAVLINK_RAW_BASE_URL = `https://raw.githubusercontent.com/mavlink/mavlink/${BatchProcessor.MAVLINK_COMMIT}/message_definitions/v1.0`

  constructor() {
    this.generator = new MAVLinkGenerator()
  }

  async processAllDialects(options: BatchProcessorOptions): Promise<void> {
    console.log('Fetching list of available dialects...')

    // Get list of XML files from GitHub API
    const response = await fetch(BatchProcessor.MAVLINK_DIALECTS_URL)
    if (!response.ok) {
      throw new Error(`Failed to fetch dialects list: ${response.statusText}`)
    }

    const files = (await response.json()) as Array<{ name: string; download_url: string }>
    const xmlFiles = files.filter((file) => file.name.endsWith('.xml'))

    console.log(`Found ${xmlFiles.length} dialect files to process`)

    // Create main output directory
    await fs.mkdir(options.outputDir, { recursive: true })

    // Process each dialect
    const processedDialects: string[] = []
    for (const file of xmlFiles) {
      const dialectName = file.name.replace('.xml', '').toLowerCase().replace(/_/g, '')
      const dialectOutputDir = join(options.outputDir, dialectName)

      console.log(`Processing ${file.name}...`)

      try {
        const generationOptions: GenerationOptions = {
          dialectName,
          outputFormat: options.dialectFormat,
          includeEnums: options.includeEnums,
          includeTypeGuards: options.includeTypeGuards,
        }

        await this.generator.generateFromURL(file.download_url, dialectOutputDir, generationOptions)
        processedDialects.push(dialectName)

        // Reset parser state for next dialect
        this.generator.reset()
      } catch (error) {
        console.error(`Failed to process ${file.name}:`, error)
      }
    }

    // Generate main index file
    await this.generateMainIndex(options.outputDir, processedDialects)

    console.log(`Successfully processed ${processedDialects.length} dialects`)
  }

  async processSpecificDialects(
    dialectNames: string[],
    options: BatchProcessorOptions
  ): Promise<void> {
    console.log(`Processing ${dialectNames.length} specific dialects...`)

    // Create main output directory
    await fs.mkdir(options.outputDir, { recursive: true })

    const processedDialects: string[] = []
    for (const dialectName of dialectNames) {
      const xmlFileName = `${dialectName}.xml`
      const dialectUrl = `${BatchProcessor.MAVLINK_RAW_BASE_URL}/${xmlFileName}`
      const dialectOutputDir = join(options.outputDir, dialectName.toLowerCase())

      console.log(`Processing ${dialectName}...`)

      try {
        const generationOptions: GenerationOptions = {
          dialectName: dialectName.toLowerCase(),
          outputFormat: options.dialectFormat,
          includeEnums: options.includeEnums,
          includeTypeGuards: options.includeTypeGuards,
        }

        await this.generator.generateFromURL(dialectUrl, dialectOutputDir, generationOptions)
        processedDialects.push(dialectName.toLowerCase())

        // Reset parser state for next dialect
        this.generator.reset()
      } catch (error) {
        console.error(`Failed to process ${dialectName}:`, error)
      }
    }

    // Generate main index file
    await this.generateMainIndex(options.outputDir, processedDialects)

    console.log(`Successfully processed ${processedDialects.length} dialects`)
  }

  private async generateMainIndex(outputDir: string, dialectNames: string[]): Promise<void> {
    const indexContent = `// Auto-generated TypeScript dialects index
// Exports all available dialects

${dialectNames.map((name) => `export * as ${name} from './${name}';`).join('\n')}

`

    await fs.writeFile(join(outputDir, 'index.ts'), indexContent)
    console.log(`Generated main index file with ${dialectNames.length} dialects`)
  }

  async generatePackageJson(outputDir: string, version: string = '1.0.0'): Promise<void> {
    const packageJson = {
      name: 'mavlink-types',
      version,
      description: 'Auto-generated TypeScript types for MAVLink dialects',
      main: 'index.js',
      types: 'index.d.ts',
      files: ['**/*.ts', '**/*.js', '**/*.d.ts'],
      keywords: ['mavlink', 'typescript', 'types', 'drone', 'autopilot'],
      license: 'MIT',
      repository: {
        type: 'git',
        url: 'https://github.com/mavlink/mavlink',
      },
      scripts: {
        build: 'tsc',
        prepublishOnly: 'npm run build',
      },
      devDependencies: {
        typescript: '^5.0.0',
      },
    }

    await fs.writeFile(join(outputDir, 'package.json'), JSON.stringify(packageJson, null, 2))

    // Also generate a basic tsconfig.json
    const tsConfig = {
      compilerOptions: {
        target: 'ES2020',
        module: 'commonjs',
        declaration: true,
        outDir: './dist',
        rootDir: './',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
      },
      include: ['**/*.ts'],
      exclude: ['node_modules', 'dist'],
    }

    await fs.writeFile(join(outputDir, 'tsconfig.json'), JSON.stringify(tsConfig, null, 2))

    console.log('Generated package.json and tsconfig.json')
  }
}
