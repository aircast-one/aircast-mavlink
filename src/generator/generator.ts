import { promises as fs } from 'fs'
import { join } from 'path'
import { parseString } from 'xml2js'
import { XMLParser } from './xml-parser'
import { TypeConverter } from './type-converter'
import { TemplateEngine } from './template-engine'
import { GenerationOptions, MAVLinkDialect, MAVLinkDialectDefinition } from '../types'

export class MAVLinkGenerator {
  private xmlParser: XMLParser
  private typeConverter: TypeConverter
  private templateEngine: TemplateEngine

  constructor() {
    this.xmlParser = new XMLParser()
    this.typeConverter = new TypeConverter()
    this.templateEngine = new TemplateEngine()
  }

  async generateFromURL(
    url: string,
    outputPath: string,
    options: GenerationOptions
  ): Promise<void> {
    const definition = await this.xmlParser.parseFromURL(url)
    await this.generate(definition, outputPath, options)
  }

  async generateFromFile(
    filePath: string,
    outputPath: string,
    options: GenerationOptions
  ): Promise<void> {
    const definition = await this.xmlParser.parseFromFile(filePath)
    await this.generate(definition, outputPath, options)
  }

  private async generate(
    definition: MAVLinkDialectDefinition,
    outputPath: string,
    options: GenerationOptions
  ): Promise<void> {
    // Convert to TypeScript types
    const tsDialect = this.typeConverter.convert(definition, options.dialectName)

    // Ensure output directory exists
    await fs.mkdir(outputPath, { recursive: true })

    if (options.outputFormat === 'single') {
      // Generate single file
      const content = this.templateEngine.generateSingle(tsDialect)
      await fs.writeFile(join(outputPath, 'index.ts'), content)
    } else {
      // Generate separate files as TypeScript files
      const typesContent = this.templateEngine.generateTypes(tsDialect, options.includeEnums)
      await fs.writeFile(join(outputPath, 'types.ts'), typesContent)

      if (options.includeEnums) {
        const enumsContent = this.templateEngine.generateEnums(tsDialect)
        await fs.writeFile(join(outputPath, 'enums.ts'), enumsContent)
      }

      // Generate parser with message registry
      const parserContent = this.templateEngine.generateParser(tsDialect)
      await fs.writeFile(join(outputPath, 'parser.ts'), parserContent)

      // Generate messages/ directory with individual message modules
      const messagesDir = join(outputPath, 'messages')
      await fs.mkdir(messagesDir, { recursive: true })

      for (const message of tsDialect.messages) {
        const messageContent = this.templateEngine.generateMessageModule({
          dialectName: options.dialectName,
          originalName: message.originalName,
          name: message.name,
          constantName: message.originalName.toUpperCase(),
          id: message.id ?? 0,
          crcExtra: message.crcExtra,
          fields: message.fields.map((f) => ({
            name: f.name,
            type: f.type,
            originalType: f.originalType ?? f.type,
            arrayLength: f.arrayLength,
            extension: f.extension,
            optional: f.optional,
            description: f.description,
          })),
          description: message.description,
        })
        const fileName = message.originalName.toLowerCase().replace(/_/g, '-') + '.ts'
        await fs.writeFile(join(messagesDir, fileName), messageContent)
      }

      const indexContent = this.templateEngine.generateIndex(tsDialect, options.includeEnums)
      await fs.writeFile(join(outputPath, 'index.ts'), indexContent)
    }

    console.log(`Generated TypeScript types for ${options.dialectName} in ${outputPath}`)
  }

  reset(): void {
    this.xmlParser.reset()
  }
}

// Standalone function for programmatic usage
export async function generateTypesFromXML(
  xmlContent: string,
  options: GenerationOptions
): Promise<{ [filename: string]: string }> {
  const converter = new TypeConverter()
  const templateEngine = new TemplateEngine()

  // Parse XML directly from string
  const definition = await new Promise<MAVLinkDialect>((resolve, reject) => {
    parseString(
      xmlContent,
      { explicitArray: false },
      (err: Error | null, result: { mavlink: MAVLinkDialect }) => {
        if (err) reject(err)
        else resolve(result.mavlink)
      }
    )
  })

  // Convert parsed XML to definition format for compatibility
  const definitionForConverter: MAVLinkDialectDefinition = {
    version: definition.version,
    dialect: definition.dialect ? parseInt(definition.dialect) : undefined,
    includes: [],
    enums: [],
    messages: [],
  }

  // Convert to TypeScript
  const tsDialect = converter.convert(definitionForConverter, options.dialectName)

  const files: { [filename: string]: string } = {}

  if (options.outputFormat === 'single') {
    files['index.ts'] = templateEngine.generateSingle(tsDialect)
  } else {
    files['types.ts'] = templateEngine.generateTypes(tsDialect)
    if (options.includeEnums) {
      files['enums.ts'] = templateEngine.generateEnums(tsDialect)
    }
    files['messages.ts'] = templateEngine.generateMessages(tsDialect)
    files['index.ts'] = templateEngine.generateIndex(tsDialect, options.includeEnums)
  }

  return files
}
