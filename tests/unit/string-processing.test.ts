import { CommonParser, CommonSerializer } from '../../src/generated/dialects/common/full'

describe('String Serialization Tests', () => {
  let parser: CommonParser
  let serializer: CommonSerializer

  beforeEach(() => {
    parser = new CommonParser()
    serializer = new CommonSerializer()
  })

  describe('STATUSTEXT Message Tests', () => {
    test('should serialize and parse STATUSTEXT message with simple string', () => {
      const originalMessage = {
        message_name: 'STATUSTEXT',
        system_id: 1,
        component_id: 1,
        sequence: 15,
        payload: {
          severity: 6, // MAV_SEVERITY_INFO
          text: 'Hello World',
        },
      }

      const serializedBytes = serializer.serialize(originalMessage)
      const parsedMessages = parser.parseBytes(serializedBytes)

      expect(parsedMessages).toHaveLength(1)
      const parsedMessage = parsedMessages[0]

      expect(parsedMessage.message_name).toBe('STATUSTEXT')
      expect(parsedMessage.payload.severity).toBe(6)
      expect(parsedMessage.payload.text).toBe('Hello World')
    })

    test('should handle STATUSTEXT with maximum length string', () => {
      const maxText = 'A'.repeat(50) // STATUSTEXT text field is char[50]

      const originalMessage = {
        message_name: 'STATUSTEXT',
        system_id: 1,
        component_id: 1,
        sequence: 16,
        payload: {
          severity: 4, // MAV_SEVERITY_WARNING
          text: maxText,
        },
      }

      const serializedBytes = serializer.serialize(originalMessage)
      const parsedMessages = parser.parseBytes(serializedBytes)

      expect(parsedMessages).toHaveLength(1)
      const parsedMessage = parsedMessages[0]

      expect(parsedMessage.payload.text).toBe(maxText)
    })

    test('should handle STATUSTEXT with empty string', () => {
      const originalMessage = {
        message_name: 'STATUSTEXT',
        system_id: 1,
        component_id: 1,
        sequence: 17,
        payload: {
          severity: 2, // MAV_SEVERITY_CRITICAL
          text: '',
        },
      }

      const serializedBytes = serializer.serialize(originalMessage)
      const parsedMessages = parser.parseBytes(serializedBytes)

      expect(parsedMessages).toHaveLength(1)
      const parsedMessage = parsedMessages[0]

      expect(parsedMessage.payload.text).toBe('')
    })

    test('should truncate text that exceeds maximum length', () => {
      const longText = 'A'.repeat(60) // Exceeds 50 character limit

      const originalMessage = {
        message_name: 'STATUSTEXT',
        system_id: 1,
        component_id: 1,
        sequence: 18,
        payload: {
          severity: 1, // MAV_SEVERITY_EMERGENCY
          text: longText,
        },
      }

      const serializedBytes = serializer.serialize(originalMessage)
      const parsedMessages = parser.parseBytes(serializedBytes)

      expect(parsedMessages).toHaveLength(1)
      const parsedMessage = parsedMessages[0]

      // Should be truncated to 50 characters
      expect(parsedMessage.payload.text).toBe('A'.repeat(50))
      expect((parsedMessage.payload.text as string).length).toBe(50)
    })
  })
})
