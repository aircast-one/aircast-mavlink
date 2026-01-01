import { CommonParser, CommonSerializer } from '../../src/generated/dialects/common/full'
import { MinimalParser, MinimalSerializer } from '../../src/generated/dialects/minimal/full'

describe('Snake Case Integration Tests - Message Parsing and Serialization', () => {
  describe('Common Dialect with snake_case', () => {
    let parser: CommonParser
    let serializer: CommonSerializer

    beforeEach(() => {
      parser = new CommonParser()
      serializer = new CommonSerializer()
    })

    describe('HEARTBEAT Message Round-trip', () => {
      test('should parse and serialize HEARTBEAT message correctly with snake_case', () => {
        const originalMessage = {
          message_name: 'HEARTBEAT',
          system_id: 1,
          component_id: 1,
          sequence: 42,
          protocol_version: 2,
          payload: {
            type: 6,
            autopilot: 8,
            base_mode: 81,
            custom_mode: 12345,
            system_status: 4,
            mavlink_version: 3,
          },
        }

        // Serialize to bytes
        const serializedBytes = serializer.serialize(originalMessage)

        // Verify we got bytes
        expect(serializedBytes).toBeInstanceOf(Uint8Array)
        expect(serializedBytes.length).toBeGreaterThan(0)

        // Parse bytes back to message
        const parsedMessages = parser.parseBytes(serializedBytes)

        // Should get exactly one message
        expect(parsedMessages).toHaveLength(1)

        const parsedMessage = parsedMessages[0]

        // Verify message metadata
        expect(parsedMessage.message_name).toBe('HEARTBEAT')
        expect(parsedMessage.message_id).toBe(0)
        expect(parsedMessage.system_id).toBe(1)
        expect(parsedMessage.component_id).toBe(1)
        expect(parsedMessage.sequence).toBe(42)
        expect(parsedMessage.protocol_version).toBe(2)
        expect(parsedMessage.crc_ok).toBe(true)
        expect(parsedMessage.dialect).toBe('common')

        // Verify payload fields match with snake_case
        expect(parsedMessage.payload.type).toBe(6)
        expect(parsedMessage.payload.autopilot).toBe(8)
        expect(parsedMessage.payload.base_mode).toBe(81)
        expect(parsedMessage.payload.custom_mode).toBe(12345)
        expect(parsedMessage.payload.system_status).toBe(4)
        expect(parsedMessage.payload.mavlink_version).toBe(3)
      })

      test('should handle HEARTBEAT with default values using snake_case', () => {
        const originalMessage = {
          message_name: 'HEARTBEAT',
          system_id: 255,
          component_id: 250,
          sequence: 0,
          payload: {
            type: 0,
            autopilot: 0,
            base_mode: 0,
            custom_mode: 0,
            system_status: 0,
            mavlink_version: 3,
          },
        }

        const serializedBytes = serializer.serialize(originalMessage)
        const parsedMessages = parser.parseBytes(serializedBytes)

        expect(parsedMessages).toHaveLength(1)
        const parsedMessage = parsedMessages[0]

        expect(parsedMessage.system_id).toBe(255)
        expect(parsedMessage.component_id).toBe(250)
        expect(parsedMessage.payload.type).toBe(0)
        expect(parsedMessage.payload.autopilot).toBe(0)
        expect(parsedMessage.payload.base_mode).toBe(0)
        expect(parsedMessage.payload.custom_mode).toBe(0)
        expect(parsedMessage.payload.system_status).toBe(0)
        expect(parsedMessage.payload.mavlink_version).toBe(3)
      })
    })

    describe('SYS_STATUS Message Round-trip', () => {
      test('should parse and serialize SYS_STATUS message correctly with snake_case', () => {
        const originalMessage = {
          message_name: 'SYS_STATUS',
          system_id: 1,
          component_id: 1,
          sequence: 5,
          payload: {
            onboard_control_sensors_present: 0x1f,
            onboard_control_sensors_enabled: 0x0f,
            onboard_control_sensors_health: 0x07,
            load: 500,
            voltage_battery: 11800,
            current_battery: 1500,
            battery_remaining: 85,
            drop_rate_comm: 12,
            errors_comm: 5,
            errors_count1: 0,
            errors_count2: 0,
            errors_count3: 0,
            errors_count4: 0,
          },
        }

        const serializedBytes = serializer.serialize(originalMessage)
        const parsedMessages = parser.parseBytes(serializedBytes)

        expect(parsedMessages).toHaveLength(1)
        const parsedMessage = parsedMessages[0]

        expect(parsedMessage.message_name).toBe('SYS_STATUS')
        expect(parsedMessage.message_id).toBe(1)

        // Check the core payload fields we provided (using snake_case)
        expect(parsedMessage.payload.onboard_control_sensors_present).toBe(0x1f)
        expect(parsedMessage.payload.onboard_control_sensors_enabled).toBe(0x0f)
        expect(parsedMessage.payload.onboard_control_sensors_health).toBe(0x07)
        expect(parsedMessage.payload.load).toBe(500)
        expect(parsedMessage.payload.voltage_battery).toBe(11800)
        expect(parsedMessage.payload.current_battery).toBe(1500)
        expect(parsedMessage.payload.battery_remaining).toBe(85)
        expect(parsedMessage.payload.drop_rate_comm).toBe(12)
        expect(parsedMessage.payload.errors_comm).toBe(5)
        expect(parsedMessage.payload.errors_count1).toBe(0)
        expect(parsedMessage.payload.errors_count2).toBe(0)
        expect(parsedMessage.payload.errors_count3).toBe(0)
        expect(parsedMessage.payload.errors_count4).toBe(0)
      })
    })

    describe('Multiple Messages with snake_case', () => {
      test('should handle multiple different messages in sequence', () => {
        const messages = [
          {
            message_name: 'HEARTBEAT',
            system_id: 1,
            component_id: 1,
            sequence: 0,
            payload: {
              type: 6,
              autopilot: 8,
              base_mode: 0,
              custom_mode: 0,
              system_status: 4,
              mavlink_version: 3,
            },
          },
          {
            message_name: 'SYS_STATUS',
            system_id: 1,
            component_id: 1,
            sequence: 1,
            payload: {
              onboard_control_sensors_present: 0x1f,
              onboard_control_sensors_enabled: 0x0f,
              onboard_control_sensors_health: 0x07,
              load: 250,
              voltage_battery: 12000,
              current_battery: 1000,
              battery_remaining: 90,
              drop_rate_comm: 0,
              errors_comm: 0,
              errors_count1: 0,
              errors_count2: 0,
              errors_count3: 0,
              errors_count4: 0,
            },
          },
        ]

        // Serialize all messages and concatenate bytes
        const allBytes: number[] = []
        for (const message of messages) {
          const bytes = serializer.serialize(message)
          allBytes.push(...Array.from(bytes))
        }

        const combinedBytes = new Uint8Array(allBytes)

        // Parse all messages at once
        const parsedMessages = parser.parseBytes(combinedBytes)

        expect(parsedMessages).toHaveLength(2)

        // Verify first message (HEARTBEAT)
        expect(parsedMessages[0].message_name).toBe('HEARTBEAT')
        expect(parsedMessages[0].sequence).toBe(0)
        expect(parsedMessages[0].payload.type).toBe(6)
        expect(parsedMessages[0].payload.base_mode).toBe(0)
        expect(parsedMessages[0].payload.custom_mode).toBe(0)
        expect(parsedMessages[0].payload.system_status).toBe(4)

        // Verify second message (SYS_STATUS)
        expect(parsedMessages[1].message_name).toBe('SYS_STATUS')
        expect(parsedMessages[1].sequence).toBe(1)
        expect(parsedMessages[1].payload.load).toBe(250)
        expect(parsedMessages[1].payload.voltage_battery).toBe(12000)
        expect(parsedMessages[1].payload.current_battery).toBe(1000)
        expect(parsedMessages[1].payload.battery_remaining).toBe(90)
      })
    })

    describe('Error Handling', () => {
      test('should throw error for unknown message type', () => {
        const invalidMessage = {
          message_name: 'UNKNOWN_MESSAGE_TYPE',
          system_id: 1,
          component_id: 1,
          sequence: 0,
          payload: {},
        }

        expect(() => {
          serializer.serialize(invalidMessage)
        }).toThrow('Unknown message type: UNKNOWN_MESSAGE_TYPE')
      })
    })
  })

  describe('Minimal Dialect with snake_case', () => {
    let parser: MinimalParser
    let serializer: MinimalSerializer

    beforeEach(() => {
      parser = new MinimalParser()
      serializer = new MinimalSerializer()
    })

    describe('HEARTBEAT Message Round-trip', () => {
      test('should parse and serialize HEARTBEAT message correctly with snake_case', () => {
        const originalMessage = {
          message_name: 'HEARTBEAT',
          system_id: 2,
          component_id: 3,
          sequence: 100,
          payload: {
            type: 1,
            autopilot: 3,
            base_mode: 157,
            custom_mode: 999,
            system_status: 3,
            mavlink_version: 3,
          },
        }

        const serializedBytes = serializer.serialize(originalMessage)
        const parsedMessages = parser.parseBytes(serializedBytes)

        expect(parsedMessages).toHaveLength(1)
        const parsedMessage = parsedMessages[0]

        expect(parsedMessage.message_name).toBe('HEARTBEAT')
        expect(parsedMessage.system_id).toBe(2)
        expect(parsedMessage.component_id).toBe(3)
        expect(parsedMessage.sequence).toBe(100)
        expect(parsedMessage.dialect).toBe('minimal')

        // Verify snake_case field names
        expect(parsedMessage.payload.type).toBe(1)
        expect(parsedMessage.payload.autopilot).toBe(3)
        expect(parsedMessage.payload.base_mode).toBe(157)
        expect(parsedMessage.payload.custom_mode).toBe(999)
        expect(parsedMessage.payload.system_status).toBe(3)
        expect(parsedMessage.payload.mavlink_version).toBe(3)
      })
    })
  })

  describe('Common Dialect PROTOCOL_VERSION with snake_case', () => {
    let parser: CommonParser
    let serializer: CommonSerializer

    beforeEach(() => {
      parser = new CommonParser()
      serializer = new CommonSerializer()
    })

    test('should parse and serialize PROTOCOL_VERSION message with arrays correctly using snake_case', () => {
      const originalMessage = {
        message_name: 'PROTOCOL_VERSION',
        system_id: 1,
        component_id: 1,
        sequence: 50,
        payload: {
          version: 200,
          min_version: 100,
          max_version: 300,
          spec_version_hash: [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08],
          library_version_hash: [0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18],
        },
      }

      const serializedBytes = serializer.serialize(originalMessage)
      const parsedMessages = parser.parseBytes(serializedBytes)

      expect(parsedMessages).toHaveLength(1)
      const parsedMessage = parsedMessages[0]

      expect(parsedMessage.message_name).toBe('PROTOCOL_VERSION')
      expect(parsedMessage.message_id).toBe(300)
      expect(parsedMessage.payload.version).toBe(200)
      expect(parsedMessage.payload.min_version).toBe(100)
      expect(parsedMessage.payload.max_version).toBe(300)
      expect(parsedMessage.payload.spec_version_hash).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
      expect(parsedMessage.payload.library_version_hash).toEqual([17, 18, 19, 20, 21, 22, 23, 24])
    })

    test('should handle PROTOCOL_VERSION with partial arrays using snake_case', () => {
      const originalMessage = {
        message_name: 'PROTOCOL_VERSION',
        system_id: 1,
        component_id: 1,
        sequence: 51,
        payload: {
          version: 150,
          min_version: 50,
          max_version: 200,
          spec_version_hash: [0xaa, 0xbb, 0xcc],
        },
      }

      const serializedBytes = serializer.serialize(originalMessage)
      const parsedMessages = parser.parseBytes(serializedBytes)

      expect(parsedMessages).toHaveLength(1)
      const parsedMessage = parsedMessages[0]

      expect(parsedMessage.payload.version).toBe(150)
      expect(parsedMessage.payload.min_version).toBe(50)
      expect(parsedMessage.payload.max_version).toBe(200)
      // Arrays should be padded with zeros for missing elements
      expect(parsedMessage.payload.spec_version_hash).toEqual([0xaa, 0xbb, 0xcc, 0, 0, 0, 0, 0])
      expect(parsedMessage.payload.library_version_hash).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    })
  })

  describe('Cross-Dialect Compatibility with snake_case', () => {
    test('minimal dialect messages should be parseable by common dialect parser', () => {
      const minimalParser = new MinimalParser()
      const minimalSerializer = new MinimalSerializer()
      const commonParser = new CommonParser()

      // Create HEARTBEAT in minimal dialect using snake_case
      const heartbeatMessage = {
        message_name: 'HEARTBEAT',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        payload: {
          base_mode: 89,
          custom_mode: 5432,
          system_status: 4,
          mavlink_version: 3,
        },
      }

      // Serialize with minimal
      const serializedBytes = minimalSerializer.serialize(heartbeatMessage)

      // Parse with both parsers
      const minimalParsed = minimalParser.parseBytes(serializedBytes)
      const commonParsed = commonParser.parseBytes(serializedBytes)

      // Both should parse successfully
      expect(minimalParsed).toHaveLength(1)
      expect(commonParsed).toHaveLength(1)

      // Payload should be identical with snake_case fields
      expect(minimalParsed[0].payload.type).toBe(commonParsed[0].payload.type)
      expect(minimalParsed[0].payload.autopilot).toBe(commonParsed[0].payload.autopilot)
      expect(minimalParsed[0].payload.base_mode).toBe(commonParsed[0].payload.base_mode)
      expect(minimalParsed[0].payload.custom_mode).toBe(commonParsed[0].payload.custom_mode)
      expect(minimalParsed[0].payload.system_status).toBe(commonParsed[0].payload.system_status)
      expect(minimalParsed[0].payload.mavlink_version).toBe(commonParsed[0].payload.mavlink_version)

      // Only dialect identifier should differ
      expect(minimalParsed[0].dialect).toBe('minimal')
      expect(commonParsed[0].dialect).toBe('common')
    })
  })

  describe('Data Type Validation with snake_case', () => {
    test('should handle various MAVLink data types correctly', () => {
      const parser = new CommonParser()
      const serializer = new CommonSerializer()

      // Test HEARTBEAT with extreme values using snake_case
      const heartbeatMessage = {
        message_name: 'HEARTBEAT',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        payload: {
          type: 255,
          autopilot: 255,
          base_mode: 255,
          custom_mode: 4294967295,
          system_status: 255,
          mavlink_version: 3,
        },
      }

      const serializedBytes = serializer.serialize(heartbeatMessage)
      const parsedMessages = parser.parseBytes(serializedBytes)

      expect(parsedMessages).toHaveLength(1)
      const parsed = parsedMessages[0]

      // Verify extreme values are preserved with snake_case
      expect(parsed.payload.type).toBe(255)
      expect(parsed.payload.autopilot).toBe(255)
      expect(parsed.payload.base_mode).toBe(255)
      expect(parsed.payload.custom_mode).toBe(4294967295)
      expect(parsed.payload.system_status).toBe(255)
    })
  })

  describe('Streaming and Partial Data with snake_case', () => {
    test('should handle partial messages across multiple parseBytes calls', () => {
      const parser = new CommonParser()
      const serializer = new CommonSerializer()

      const message = {
        message_name: 'HEARTBEAT',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        payload: {
          type: 6,
          autopilot: 8,
          base_mode: 0,
          custom_mode: 0,
          system_status: 4,
          mavlink_version: 3,
        },
      }

      const fullBytes = serializer.serialize(message)

      // Split the message into two parts
      const part1 = fullBytes.slice(0, 10)
      const part2 = fullBytes.slice(10)

      // First part should not yield any complete messages
      const messages1 = parser.parseBytes(part1)
      expect(messages1).toHaveLength(0)

      // Second part should complete the message
      const messages2 = parser.parseBytes(part2)
      expect(messages2).toHaveLength(1)
      expect(messages2[0].message_name).toBe('HEARTBEAT')
      expect(messages2[0].payload.base_mode).toBe(0)
      expect(messages2[0].payload.custom_mode).toBe(0)
      expect(messages2[0].payload.system_status).toBe(4)
    })

    test('should parse multiple complete messages in single buffer', () => {
      const parser = new CommonParser()
      const serializer = new CommonSerializer()

      const message1 = {
        message_name: 'HEARTBEAT',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        payload: {
          type: 1,
          autopilot: 3,
          base_mode: 0,
          custom_mode: 0,
          system_status: 4,
          mavlink_version: 3,
        },
      }

      const message2 = {
        message_name: 'HEARTBEAT',
        system_id: 1,
        component_id: 1,
        sequence: 1,
        payload: {
          type: 2,
          autopilot: 4,
          base_mode: 0,
          custom_mode: 0,
          system_status: 4,
          mavlink_version: 3,
        },
      }

      const bytes1 = serializer.serialize(message1)
      const bytes2 = serializer.serialize(message2)

      // Combine both messages
      const combinedBytes = new Uint8Array([...bytes1, ...bytes2])

      const messages = parser.parseBytes(combinedBytes)
      expect(messages).toHaveLength(2)

      expect(messages[0].payload.type).toBe(1)
      expect(messages[0].payload.autopilot).toBe(3)
      expect(messages[0].payload.base_mode).toBe(0)
      expect(messages[0].payload.custom_mode).toBe(0)
      expect(messages[0].payload.system_status).toBe(4)
      expect(messages[0].sequence).toBe(0)

      expect(messages[1].payload.type).toBe(2)
      expect(messages[1].payload.autopilot).toBe(4)
      expect(messages[1].payload.base_mode).toBe(0)
      expect(messages[1].payload.custom_mode).toBe(0)
      expect(messages[1].payload.system_status).toBe(4)
      expect(messages[1].sequence).toBe(1)
    })
  })
})
