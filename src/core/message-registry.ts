// Message registry - stores and retrieves message definitions
import { MessageDefinition, IMessageRegistry } from './types'

/**
 * Registry for MAVLink message definitions.
 * Provides O(1) lookup by both ID and name.
 */
export class MessageRegistry implements IMessageRegistry {
  private definitionsById: Map<number, MessageDefinition> = new Map()
  private definitionsByName: Map<string, MessageDefinition> = new Map()
  private crcExtraTable: Record<number, number> = {}

  /**
   * Register a message definition
   */
  register(def: MessageDefinition, crcExtra: number): void {
    this.definitionsById.set(def.id, def)
    this.definitionsByName.set(def.name, def)
    this.crcExtraTable[def.id] = crcExtra
  }

  /**
   * Get CRC extra value for a message ID
   */
  getCrcExtra(messageId: number): number | undefined {
    return this.crcExtraTable[messageId]
  }

  /**
   * Get the full CRC extra table
   */
  getCrcExtraTable(): Record<number, number> {
    return this.crcExtraTable
  }

  /**
   * Get message definition by ID
   */
  getMessageDefinition(id: number): MessageDefinition | undefined {
    return this.definitionsById.get(id)
  }

  /**
   * Get message definition by name
   */
  getMessageDefinitionByName(name: string): MessageDefinition | undefined {
    return this.definitionsByName.get(name)
  }

  /**
   * Check if a message ID is supported
   */
  supportsMessage(messageId: number): boolean {
    return this.definitionsById.has(messageId)
  }

  /**
   * Check if a message name is supported
   */
  supportsMessageName(messageName: string): boolean {
    return this.definitionsByName.has(messageName)
  }

  /**
   * Get all supported message IDs
   */
  getSupportedMessageIds(): number[] {
    return Array.from(this.definitionsById.keys()).sort((a, b) => a - b)
  }

  /**
   * Get all supported message names
   */
  getSupportedMessageNames(): string[] {
    return Array.from(this.definitionsByName.keys())
  }
}
