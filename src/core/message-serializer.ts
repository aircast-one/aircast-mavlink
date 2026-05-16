// Message serializer — encodes messages to MAVLink bytes
import { MessageDefinition, SerializeOptions } from './types'
import { MessageRegistry } from './message-registry'
import { createFrame } from './frame'
import { encodePayload, getFieldDefaultValue } from './codec'

/**
 * Serializes MAVLink messages to bytes.
 * Standalone — does not require a parser instance.
 */
export class MessageSerializer {
  private readonly registry: MessageRegistry

  constructor() {
    this.registry = new MessageRegistry()
  }

  registerDefinition(def: MessageDefinition): void {
    this.registry.register(def)
  }

  serialize(
    messageName: string,
    payload: Record<string, unknown>,
    options: SerializeOptions
  ): Uint8Array {
    const messageDef = this.registry.getMessageDefinitionByName(messageName)

    if (!messageDef) {
      throw new Error(`Unknown message type: ${messageName}`)
    }

    const completePayload = this.completeWithDefaults(payload, messageDef)
    const encodedPayload = encodePayload(completePayload, messageDef.fields)

    const needsV2 = messageDef.id > 255
    const protocolVersion = (options.protocol_version ?? (needsV2 ? 2 : 1)) as 1 | 2

    return createFrame(
      messageDef.id,
      encodedPayload,
      options.system_id,
      options.component_id,
      options.sequence,
      messageDef.crcExtra,
      protocolVersion
    )
  }

  private completeWithDefaults(
    payload: Record<string, unknown>,
    messageDef: MessageDefinition
  ): Record<string, unknown> {
    const complete = { ...payload }

    for (const field of messageDef.fields) {
      if (complete[field.name] === undefined) {
        complete[field.name] = getFieldDefaultValue(field)
      }
    }

    return complete
  }
}
