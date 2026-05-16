#!/usr/bin/env node

import { Command } from 'commander'
import { MAVLinkGenerator } from './generator/generator'
import { BatchProcessor } from './generator/batch-processor'
import { GenerationOptions } from './types'
import { existsSync } from 'fs'
import pkg from '../package.json'

const program = new Command()

program
  .name('aircast-mavlink')
  .description('Aircast MAVLink TypeScript type generator')
  .version(pkg.version)

program
  .command('generate')
  .description('Generate TypeScript types from a MAVLink XML dialect')
  .option('-i, --input <path>', 'Input XML file path or URL')
  .option('-o, --output <path>', 'Output directory path', './types')
  .option('-n, --name <name>', 'Dialect name (auto-detected if not provided)')
  .option('-f, --format <format>', 'Output format: single or separate', 'separate')
  .option('--no-enums', 'Skip enum generation')
  .option('--no-type-guards', 'Skip type guard generation')
  .action(async (options) => {
    try {
      if (!options.input) {
        console.error('Error: Input file or URL is required')
        process.exit(1)
      }

      const generator = new MAVLinkGenerator()
      const dialectName = options.name || extractDialectName(options.input)

      const generationOptions: GenerationOptions = {
        dialectName,
        outputFormat: options.format as 'single' | 'separate',
        includeEnums: options.enums !== false,
        includeTypeGuards: options.typeGuards !== false,
      }

      console.log(`Generating TypeScript types for ${dialectName}...`)
      console.log(`Input: ${options.input}`)
      console.log(`Output: ${options.output}`)
      console.log(`Format: ${generationOptions.outputFormat}`)

      if (options.input.startsWith('http')) {
        await generator.generateFromURL(options.input, options.output, generationOptions)
      } else {
        if (!existsSync(options.input)) {
          console.error(`Error: Input file does not exist: ${options.input}`)
          process.exit(1)
        }
        await generator.generateFromFile(options.input, options.output, generationOptions)
      }

      console.log('✅ Generation completed successfully!')
    } catch (error) {
      console.error('❌ Generation failed:', error)
      process.exit(1)
    }
  })

program
  .command('batch')
  .description('Generate TypeScript types for multiple MAVLink dialects')
  .option('-o, --output <path>', 'Output directory path', './mavlink-types')
  .option(
    '-d, --dialects <dialects>',
    'Comma-separated list of dialect names (generates all if not specified)'
  )
  .option('-f, --format <format>', 'Output format: single or separate', 'separate')
  .option('--no-enums', 'Skip enum generation')
  .option('--no-type-guards', 'Skip type guard generation')
  .option('--package', 'Generate package.json and tsconfig.json')
  .action(async (options) => {
    try {
      const processor = new BatchProcessor()

      const processorOptions = {
        outputDir: options.output,
        dialectFormat: options.format as 'single' | 'separate',
        includeEnums: options.enums !== false,
        includeTypeGuards: options.typeGuards !== false,
      }

      console.log(`Generating TypeScript types for MAVLink dialects...`)
      console.log(`Output directory: ${options.output}`)
      console.log(`Format: ${processorOptions.dialectFormat}`)

      if (options.dialects) {
        const dialectNames = options.dialects.split(',').map((name: string) => name.trim())
        console.log(`Processing specific dialects: ${dialectNames.join(', ')}`)
        await processor.processSpecificDialects(dialectNames, processorOptions)
      } else {
        console.log('Processing all available dialects...')
        await processor.processAllDialects(processorOptions)
      }

      if (options.package) {
        await processor.generatePackageJson(options.output)
      }

      console.log('✅ Batch generation completed successfully!')
    } catch (error) {
      console.error('❌ Batch generation failed:', error)
      process.exit(1)
    }
  })

program
  .command('list')
  .description('List available MAVLink dialects')
  .action(async () => {
    try {
      console.log('Fetching available MAVLink dialects...')

      const response = await fetch(
        'https://api.github.com/repos/mavlink/mavlink/contents/message_definitions/v1.0'
      )

      if (!response.ok) {
        throw new Error(`Failed to fetch dialects: ${response.statusText}`)
      }

      const files = (await response.json()) as Array<{ name: string }>
      const dialects = files
        .filter((file) => file.name.endsWith('.xml'))
        .map((file) => file.name.replace('.xml', ''))
        .sort()

      console.log('\nAvailable MAVLink dialects:')
      console.log('==========================')
      dialects.forEach((dialect) => {
        console.log(`  ${dialect}`)
      })
      console.log(`\nTotal: ${dialects.length} dialects`)
    } catch (error) {
      console.error('❌ Failed to fetch dialects list:', error)
      process.exit(1)
    }
  })

function extractDialectName(input: string): string {
  const parts = input.split('/')
  const filename = parts[parts.length - 1]
  return filename.replace('.xml', '').toLowerCase().replace(/_/g, '')
}

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  process.exit(1)
})

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
  process.exit(1)
})

program.parse()
