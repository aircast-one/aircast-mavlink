import { parseString } from 'xml2js'
import { promises as fs } from 'fs'
import path from 'path'
import {
  MAVLinkDialectDefinition,
  EnumDefinition,
  MessageDefinition,
  FieldDefinition,
  MAVLinkDialect,
  XMLEnum,
  XMLMessage,
} from '../types'
import { getTypeSize } from './mavlink-crc'

export class XMLParser {
  private processedUrls = new Set<string>()

  async parseFromURL(url: string): Promise<MAVLinkDialectDefinition> {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`)
    }
    const xmlContent = await response.text()
    return this.parseXML(xmlContent, url)
  }

  async parseFromFile(filePath: string): Promise<MAVLinkDialectDefinition> {
    const xmlContent = await fs.readFile(filePath, 'utf-8')
    return this.parseXML(xmlContent, filePath)
  }

  async parseFromString(xmlContent: string): Promise<MAVLinkDialectDefinition> {
    return this.parseXML(xmlContent, '<string>')
  }

  private async parseXML(xmlContent: string, source: string): Promise<MAVLinkDialectDefinition> {
    return new Promise((resolve, reject) => {
      parseString(xmlContent, { explicitArray: false }, async (err, result) => {
        if (err) {
          reject(new Error(`Failed to parse XML from ${source}: ${err.message}`))
          return
        }

        try {
          const definition = await this.processDefinition(result.mavlink, source, xmlContent)
          resolve(definition)
        } catch (error) {
          reject(error)
        }
      })
    })
  }

  private async processDefinition(
    mavlinkData: MAVLinkDialect,
    source: string,
    rawXmlContent?: string
  ): Promise<MAVLinkDialectDefinition> {
    if (!mavlinkData) {
      // Return empty definition for XML without mavlink root
      return {
        version: undefined,
        dialect: undefined,
        includes: [],
        enums: [],
        messages: [],
      }
    }

    const definition: MAVLinkDialectDefinition = {
      version: mavlinkData.version,
      dialect: mavlinkData.dialect ? parseInt(mavlinkData.dialect) : undefined,
      includes: [],
      enums: [],
      messages: [],
    }

    // Process includes
    if (mavlinkData.include) {
      const includes = Array.isArray(mavlinkData.include)
        ? mavlinkData.include
        : [mavlinkData.include]
      for (const include of includes) {
        const includeUrl = this.resolveIncludeUrl(include, source)
        if (!this.processedUrls.has(includeUrl)) {
          this.processedUrls.add(includeUrl)
          try {
            const includedDefinition = await this.parseFromURL(includeUrl)
            // Merge included definitions
            if (includedDefinition.enums) {
              definition.enums!.push(...includedDefinition.enums)
            }
            if (includedDefinition.messages) {
              definition.messages!.push(...includedDefinition.messages)
            }
          } catch (error) {
            console.warn(`Warning: Failed to process include ${includeUrl}:`, error)
          }
        }
      }
    }

    // Process enums
    if (mavlinkData.enums && mavlinkData.enums.enum) {
      const enums = Array.isArray(mavlinkData.enums.enum)
        ? mavlinkData.enums.enum
        : [mavlinkData.enums.enum]
      for (const enumData of enums) {
        const enumDef = this.processEnum(enumData)
        if (enumDef) {
          definition.enums!.push(enumDef)
        }
      }
    }

    // Process messages
    if (mavlinkData.messages && mavlinkData.messages.message) {
      const messages = Array.isArray(mavlinkData.messages.message)
        ? mavlinkData.messages.message
        : [mavlinkData.messages.message]
      for (const messageData of messages) {
        const messageDef = this.processMessage(messageData, rawXmlContent)
        if (messageDef) {
          definition.messages!.push(messageDef)
        }
      }
    }

    return definition
  }

  private resolveIncludeUrl(include: string, source: string): string {
    if (include.startsWith('http')) {
      return include
    }

    // If source is a URL, resolve relative to it
    if (source.startsWith('http')) {
      const url = new URL(source)
      url.pathname = url.pathname.replace(/[^/]*$/, include)
      return url.toString()
    }

    // Otherwise, resolve relative to the directory of the source file
    return path.resolve(path.dirname(source), include)
  }

  private processEnum(enumData: XMLEnum): EnumDefinition | null {
    if (!enumData.$ || !enumData.$.name) {
      return null
    }

    const enumDef: EnumDefinition = {
      name: enumData.$.name,
      description: enumData.description || '',
      bitmask: enumData.$.bitmask === 'true',
      entries: [],
    }

    if (enumData.entry) {
      const entries = Array.isArray(enumData.entry) ? enumData.entry : [enumData.entry]
      for (const entry of entries) {
        if (entry.$ && entry.$.name && entry.$.value !== undefined) {
          enumDef.entries.push({
            name: entry.$.name,
            value: entry.$.value,
            description: entry.description || entry._ || '',
          })
        }
      }
    }

    return enumDef
  }

  private processMessage(
    messageData: XMLMessage,
    rawXmlContent?: string
  ): MessageDefinition | null {
    if (!messageData.$ || !messageData.$.name || !messageData.$.id) {
      return null
    }

    const messageDef: MessageDefinition = {
      id: parseInt(messageData.$.id),
      name: messageData.$.name,
      description: messageData.description || '',
      fields: [],
    }

    if (messageData.field) {
      const fields = Array.isArray(messageData.field) ? messageData.field : [messageData.field]

      // Check if extensions marker exists as separate element (XML2JS parses <extensions/> as a separate property)
      const hasExtensionsElement = messageData.extensions !== undefined

      // If we have extensions, we need to determine which fields are extensions
      let extensionFieldNames: Set<string> = new Set()

      if (hasExtensionsElement && rawXmlContent) {
        extensionFieldNames = this.findExtensionFields(messageDef.name, rawXmlContent)
      }

      for (const field of fields) {
        // XMLField should always be an object with $ property
        if (typeof field === 'object' && field && field.$ && field.$.name && field.$.type) {
          const isExtension = extensionFieldNames.has(field.$.name)

          const fieldDef: FieldDefinition = {
            name: field.$.name,
            type: field.$.type,
            enum: field.$.enum,
            description: field.description || field._ || '',
            extension: isExtension,
          }
          messageDef.fields.push(fieldDef)
        }
      }

      // Fallback: If extensions element exists but we couldn't parse the raw XML,
      // use payload size heuristic to determine extensions
      if (hasExtensionsElement && extensionFieldNames.size === 0) {
        let corePayloadSize = 0
        const maxV1PayloadSize = 255 // MAVLink v1 maximum payload size

        for (let i = 0; i < messageDef.fields.length; i++) {
          const field = messageDef.fields[i]
          const fieldSize = this.getFieldSize(field.type)

          // If adding this field would exceed v1 limit, mark it and all following as extensions
          if (corePayloadSize + fieldSize > maxV1PayloadSize) {
            for (let j = i; j < messageDef.fields.length; j++) {
              messageDef.fields[j].extension = true
            }
            break
          }

          corePayloadSize += fieldSize
        }
      }
    }

    return messageDef
  }

  /**
   * Parse raw XML content to find which fields are extensions by locating the <extensions/> marker
   */
  private findExtensionFields(messageName: string, rawXmlContent: string): Set<string> {
    const extensionFields = new Set<string>()

    try {
      // Find the message definition in the raw XML
      const messageRegex = new RegExp(
        `<message[^>]*name="${messageName}"[^>]*>([\\s\\S]*?)</message>`,
        'i'
      )
      const messageMatch = rawXmlContent.match(messageRegex)

      if (!messageMatch) {
        return extensionFields
      }

      const messageContent = messageMatch[1]

      // Find the position of the <extensions/> marker
      const extensionsMatch = messageContent.match(/<extensions\s*\/?>/)

      if (!extensionsMatch) {
        return extensionFields
      }

      // Get content after the extensions marker
      const extensionsIndex = extensionsMatch.index! + extensionsMatch[0].length
      const afterExtensions = messageContent.substring(extensionsIndex)

      // Find all field names after the extensions marker
      const fieldRegex = /<field[^>]*name="([^"]+)"/g
      let fieldMatch

      while ((fieldMatch = fieldRegex.exec(afterExtensions)) !== null) {
        extensionFields.add(fieldMatch[1])
      }
    } catch (error) {
      console.warn(`Warning: Failed to parse extension fields for message ${messageName}:`, error)
    }

    return extensionFields
  }

  reset(): void {
    this.processedUrls.clear()
  }

  private getFieldSize(type: string): number {
    if (type.includes('[') && type.includes(']')) {
      const baseType = type.substring(0, type.indexOf('['))
      const arrayLength = parseInt(type.substring(type.indexOf('[') + 1, type.indexOf(']')))
      return getTypeSize(baseType) * arrayLength
    }
    return getTypeSize(type)
  }
}
