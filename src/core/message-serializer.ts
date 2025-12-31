// Message serializer - encodes messages to MAVLink bytes
import { FieldDefinition, IMessageSerializer } from './types'
import { MessageRegistry } from './message-registry'
import { createFrame } from './frame'
import { encodePayload, getFieldDefaultValue, sortFieldsByWireOrder } from './codec'

/**
 * Serializes MAVLink messages to bytes.
 * Delegates message lookup to MessageRegistry.
 */
export class MessageSerializer implements IMessageSerializer {
  constructor(private readonly registry: MessageRegistry) {}

  /**
   * Serialize a message to MAVLink bytes
   */
  serializeMessage(message: Record<string, unknown> & { message_name: string }): Uint8Array {
    const messageDef = this.registry.getMessageDefinitionByName(message.message_name)

    if (!messageDef) {
      throw new Error(`Unknown message type: ${message.message_name}`)
    }

    const messageFields = this.extractMessageFields(message)
    const completeMessage = this.completeMessageWithDefaults(messageFields, messageDef.fields)
    const payload = encodePayload(completeMessage, messageDef.fields)

    const systemId = typeof message.system_id === 'number' ? message.system_id : 1
    const componentId = typeof message.component_id === 'number' ? message.component_id : 1
    const sequence = typeof message.sequence === 'number' ? message.sequence : 0

    const crcExtra = this.registry.getCrcExtra(messageDef.id)
    if (crcExtra === undefined) {
      throw new Error(`No CRC_EXTRA defined for message ID ${messageDef.id}`)
    }

    const needsV2 = messageDef.id > 255
    const userVersion =
      typeof message.protocol_version === 'number' ? message.protocol_version : undefined
    const protocolVersion = (userVersion ?? (needsV2 ? 2 : 1)) as 1 | 2

    return createFrame(
      messageDef.id,
      payload,
      systemId,
      componentId,
      sequence,
      crcExtra,
      protocolVersion
    )
  }

  /**
   * Complete a message with default values for all undefined fields
   */
  completeMessage(
    message: Record<string, unknown> & { message_name: string }
  ): Record<string, unknown> {
    const messageDef = this.registry.getMessageDefinitionByName(message.message_name)

    if (!messageDef) {
      throw new Error(`Unknown message type: ${message.message_name}`)
    }

    if (!message.payload || typeof message.payload !== 'object') {
      throw new Error(`Message must have a 'payload' object containing the message fields.`)
    }

    const messageFields = message.payload as Record<string, unknown>
    const sortedFields = sortFieldsByWireOrder(messageDef.fields)

    const completedFields: Record<string, unknown> = { ...messageFields }
    for (const field of sortedFields) {
      if (completedFields[field.name] === undefined) {
        completedFields[field.name] = getFieldDefaultValue(field)
      }
    }

    return {
      ...message,
      payload: completedFields,
    }
  }

  /**
   * Extract message fields from payload structure
   */
  private extractMessageFields(message: Record<string, unknown>): Record<string, unknown> {
    if (!message.payload || typeof message.payload !== 'object') {
      throw new Error(
        `Message must have a 'payload' object containing the message fields. ` +
          `Expected format: { message_name: '...', system_id: 1, component_id: 1, sequence: 0, payload: { ...fields } }`
      )
    }
    return message.payload as Record<string, unknown>
  }

  /**
   * Complete message with default values for missing fields
   */
  private completeMessageWithDefaults(
    message: Record<string, unknown>,
    fields: FieldDefinition[]
  ): Record<string, unknown> {
    const completeMessage = { ...message }

    for (const field of fields) {
      if (completeMessage[field.name] === undefined) {
        completeMessage[field.name] = getFieldDefaultValue(field)
      }
    }

    return completeMessage
  }
}
