// Message registry — stores and retrieves message definitions
import { MessageDefinition } from './types'

/**
 * Registry for MAVLink message definitions.
 * Provides O(1) lookup by both ID and name.
 */
export class MessageRegistry {
  private definitionsById: Map<number, MessageDefinition> = new Map()
  private definitionsByName: Map<string, MessageDefinition> = new Map()

  register(def: MessageDefinition): void {
    this.definitionsById.set(def.id, def)
    this.definitionsByName.set(def.name, def)
  }

  getCrcExtraTable(): Record<number, number> {
    const table: Record<number, number> = {}
    for (const [id, def] of this.definitionsById) {
      table[id] = def.crcExtra
    }
    return table
  }

  getMessageDefinition(id: number): MessageDefinition | undefined {
    return this.definitionsById.get(id)
  }

  getMessageDefinitionByName(name: string): MessageDefinition | undefined {
    return this.definitionsByName.get(name)
  }

  supportsMessage(messageId: number): boolean {
    return this.definitionsById.has(messageId)
  }

  getSupportedMessageIds(): number[] {
    return Array.from(this.definitionsById.keys()).sort((a, b) => a - b)
  }
}
