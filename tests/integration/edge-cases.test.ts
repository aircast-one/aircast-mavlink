import { CommonParser, CommonSerializer } from '../../src/generated/dialects/common/full'
import { MinimalParser } from '../../src/generated/dialects/minimal/full'

describe('Edge Cases and Error Conditions', () => {
  describe('Invalid Input Handling', () => {
    let parser: CommonParser
    let serializer: CommonSerializer

    beforeEach(() => {
      parser = new CommonParser()
      serializer = new CommonSerializer()
    })

    test('should handle empty byte arrays', () => {
      const empty = new Uint8Array(0)
      const parsed = parser.parseBytes(empty)

      expect(parsed).toHaveLength(0)
    })

    test('should handle null/undefined byte arrays gracefully', () => {
      // @ts-expect-error - Testing runtime behavior with null
      const parsed1 = parser.parseBytes(null)
      expect(parsed1).toHaveLength(0)

      // @ts-expect-error - Testing runtime behavior with undefined
      const parsed2 = parser.parseBytes(undefined)
      expect(parsed2).toHaveLength(0)
    })

    test('should handle corrupted headers', () => {
      const corruptedData = new Uint8Array([
        0xaa,
        0xbb,
        0xcc,
        0xdd, // Invalid magic bytes
        0x05,
        0x00,
        0x01,
        0x01, // Rest of header
        0x00,
        0x01,
        0x02,
        0x03,
        0x04, // Some payload
      ])

      const parsed = parser.parseBytes(corruptedData)
      expect(parsed).toHaveLength(0) // Should not parse anything valid
    })

    test('should skip invalid data and find valid messages', () => {
      const validHeartbeat = serializer.serialize({
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
      })

      const mixedData = new Uint8Array([
        0xff,
        0xff,
        0xff,
        0xff, // Invalid data
        ...validHeartbeat, // Valid message
        0xaa,
        0xbb,
        0xcc, // More invalid data
      ])

      const parsed = parser.parseBytes(mixedData)
      expect(parsed).toHaveLength(1)
      expect(parsed[0].message_name).toBe('HEARTBEAT')
    })

    test('should handle truncated messages', () => {
      const validMessage = serializer.serialize({
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
      })

      // Truncate the message
      const truncated = validMessage.slice(0, validMessage.length - 5)

      const parsed = parser.parseBytes(truncated)
      expect(parsed).toHaveLength(0) // Should not parse incomplete message
    })

    test('should handle messages with invalid checksums', () => {
      const validMessage = serializer.serialize({
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
      })

      // Corrupt the checksum
      const corrupted = new Uint8Array(validMessage)
      corrupted[corrupted.length - 1] = 0xff
      corrupted[corrupted.length - 2] = 0xff

      const parsed = parser.parseBytes(corrupted)
      expect(parsed).toHaveLength(1) // Should still parse
      expect(parsed[0].crc_ok).toBe(false) // But mark CRC as invalid
    })
  })

  describe('Boundary Value Testing', () => {
    let parser: CommonParser
    let serializer: CommonSerializer

    beforeEach(() => {
      parser = new CommonParser()
      serializer = new CommonSerializer()
    })

    test('should handle maximum sequence numbers', () => {
      const message = {
        message_name: 'HEARTBEAT',
        system_id: 255, // Max uint8_t,
        component_id: 255, // Max uint8_t,
        sequence: 255, // Max uint8_t,
        payload: {
          type: 255,
          autopilot: 255,
          base_mode: 255,
          custom_mode: 4294967295,
          system_status: 255,
          mavlink_version: 3,
        },
      }

      const bytes = serializer.serialize(message)
      const parsed = parser.parseBytes(bytes)

      expect(parsed).toHaveLength(1)
      expect(parsed[0].system_id).toBe(255)
      expect(parsed[0].component_id).toBe(255)
      expect(parsed[0].sequence).toBe(255)
      expect(parsed[0].payload.custom_mode).toBe(4294967295)
    })

    test('should handle zero values', () => {
      const message = {
        message_name: 'HEARTBEAT',
        system_id: 0,
        component_id: 0,
        sequence: 0,
        payload: {
          type: 0,
          autopilot: 0,
          base_mode: 0,
          custom_mode: 0,
          system_status: 0,
          mavlink_version: 0,
        },
      }

      const bytes = serializer.serialize(message)
      const parsed = parser.parseBytes(bytes)

      expect(parsed).toHaveLength(1)
      expect(parsed[0].system_id).toBe(0)
      expect(parsed[0].component_id).toBe(0)
      expect(parsed[0].payload.custom_mode).toBe(0)
    })

    test('should handle negative values for signed types', () => {
      const message = {
        message_name: 'GLOBAL_POSITION_INT',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        payload: {
          time_boot_ms: 0,
          lat: -900000000,
          lon: -1800000000,
          alt: -1000,
          relative_alt: 500,
          vx: -32768,
          vy: -32768,
          vz: -32768,
          hdg: 36000,
        },
      }

      const bytes = serializer.serialize(message)
      const parsed = parser.parseBytes(bytes)

      expect(parsed).toHaveLength(1)
      expect(parsed[0].payload.lat).toBe(-900000000)
      expect(parsed[0].payload.lon).toBe(-1800000000)
      expect(parsed[0].payload.alt).toBe(-1000)
      expect(parsed[0].payload.vx).toBe(-32768)
      expect(parsed[0].payload.vy).toBe(-32768)
      expect(parsed[0].payload.vz).toBe(-32768)
    })

    test('should handle string edge cases', () => {
      const testCases = [
        { text: '', name: 'empty string' },
        { text: 'a', name: 'single character' },
        { text: 'A'.repeat(50), name: 'maximum length' },
        { text: 'Hello\x00World', name: 'embedded null' },
        { text: '\t\n\r', name: 'control characters' },
      ]

      testCases.forEach((testCase) => {
        const message = {
          message_name: 'STATUSTEXT',
          system_id: 1,
          component_id: 1,
          sequence: 0,
          payload: {
            severity: 6,
            text: testCase.text,
          },
        }

        const bytes = serializer.serialize(message)
        const parsed = parser.parseBytes(bytes)

        expect(parsed).toHaveLength(1)
        expect(parsed[0].message_name).toBe('STATUSTEXT')

        if (testCase.text.length <= 50) {
          // Should preserve text up to null terminator
          const expectedText = testCase.text.split('\x00')[0]
          expect(parsed[0].payload.text).toBe(expectedText)
        }
      })
    })
  })

  describe('Protocol Version Compatibility', () => {
    let parser: CommonParser

    beforeEach(() => {
      parser = new CommonParser()
    })

    test('should handle MAVLink v1 format frames', () => {
      // Manually construct a MAVLink v1 HEARTBEAT frame
      const v1Frame = new Uint8Array([
        0xfe, // Magic (v1)
        0x09, // Length (9 bytes payload)
        0x00, // Sequence
        0x01, // System ID
        0x01, // Component ID
        0x00, // Message ID (HEARTBEAT)
        // Wire format: custom_mode first (uint32_t), then uint8_t fields
        0x00,
        0x00,
        0x00,
        0x00, // custom_mode=0 (uint32_t, little endian)
        0x01, // type=1
        0x03, // autopilot=3
        0x00, // base_mode=0
        0x04, // system_status=4
        0x03, // mavlink_version=3
        0x68,
        0x00, // Checksum (calculated)
      ])

      const parsed = parser.parseBytes(v1Frame)

      expect(parsed).toHaveLength(1)
      expect(parsed[0].message_name).toBe('HEARTBEAT')
      expect(parsed[0].protocol_version).toBe(1)
      expect(parsed[0].payload.type).toBe(1)
      expect(parsed[0].payload.autopilot).toBe(3)
    })

    test('should handle MAVLink v2 format frames', () => {
      // Use serializer which creates v2 frames
      const message = {
        message_name: 'HEARTBEAT',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        protocol_version: 2,
        payload: {
          type: 2,
          autopilot: 12,
          base_mode: 0,
          custom_mode: 0,
          system_status: 4,
          mavlink_version: 3,
        },
      }

      const serializer = new CommonSerializer()
      const bytes = serializer.serialize(message)
      const parsed = parser.parseBytes(bytes)

      expect(parsed).toHaveLength(1)
      expect(parsed[0].protocol_version).toBe(2)
      expect(parsed[0].payload.type).toBe(2)
      expect(parsed[0].payload.autopilot).toBe(12)
    })

    test('should handle mixed v1 and v2 frames in same stream', () => {
      const v1Frame = new Uint8Array([
        0xfe, // Magic (v1)
        0x09, // Length (9 bytes payload)
        0x00, // Sequence
        0x01, // System ID
        0x01, // Component ID
        0x00, // Message ID (HEARTBEAT)
        0x01,
        0x03,
        0x00, // Payload: type=1, autopilot=3, base_mode=0
        0x00,
        0x00,
        0x00,
        0x00, // custom_mode=0 (uint32_t, little endian)
        0x04,
        0x03, // system_status=4, mavlink_version=3
        0x68,
        0x00, // Checksum (calculated)
      ])

      const v2Message = {
        message_name: 'HEARTBEAT',
        system_id: 2,
        component_id: 2,
        sequence: 1,
        protocol_version: 2,
        payload: {
          type: 2,
          autopilot: 12,
          base_mode: 0,
          custom_mode: 0,
          system_status: 4,
          mavlink_version: 3,
        },
      }

      const serializer = new CommonSerializer()
      const v2Frame = serializer.serialize(v2Message)

      const combined = new Uint8Array([...v1Frame, ...v2Frame])
      const parsed = parser.parseBytes(combined)

      expect(parsed).toHaveLength(2)
      expect(parsed[0].protocol_version).toBe(1)
      expect(parsed[0].system_id).toBe(1)
      expect(parsed[1].protocol_version).toBe(2)
      expect(parsed[1].system_id).toBe(2)
    })
  })

  describe('Memory and Performance Edge Cases', () => {
    let parser: CommonParser
    let serializer: CommonSerializer

    beforeEach(() => {
      parser = new CommonParser()
      serializer = new CommonSerializer()
    })

    test('should handle very large byte arrays', () => {
      // Create a large buffer with multiple messages
      const messages = []
      for (let i = 0; i < 1000; i++) {
        const bytes = serializer.serialize({
          message_name: 'HEARTBEAT',
          system_id: (i % 254) + 1, // 1-254 (avoid 0 and 255)
          component_id: 1,
          sequence: i % 256,
          payload: {
            type: (i % 10) + 1,
            autopilot: 3,
            base_mode: 0,
            custom_mode: i,
            system_status: 4,
            mavlink_version: 3,
          },
        })
        messages.push(...Array.from(bytes))
      }

      const largeBuffer = new Uint8Array(messages)
      const parsed = parser.parseBytes(largeBuffer)

      expect(parsed).toHaveLength(1000)

      // Verify first and last messages
      expect(parsed[0].system_id).toBe(1)
      expect(parsed[0].sequence).toBe(0)
      expect(parsed[999].system_id).toBe((999 % 254) + 1) // Should be 235
      expect(parsed[999].sequence).toBe(999 % 256) // Should be 231
    })

    test('should handle rapid successive small parses', () => {
      const message = {
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

      const bytes = serializer.serialize(message)
      const totalParsed = []

      // Parse one byte at a time (stress test for buffer management)
      for (let i = 0; i < bytes.length; i++) {
        const singleByte = new Uint8Array([bytes[i]])
        const parsed = parser.parseBytes(singleByte)
        totalParsed.push(...parsed)
      }

      expect(totalParsed).toHaveLength(1)
      expect(totalParsed[0].message_name).toBe('HEARTBEAT')
    })

    test('should handle buffer resets during parsing', () => {
      const message = {
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

      const bytes = serializer.serialize(message)

      // Parse partial data
      parser.parseBytes(bytes.slice(0, 10))

      // Reset and parse again
      parser.resetBuffer()
      const parsed = parser.parseBytes(bytes)

      expect(parsed).toHaveLength(1)
      expect(parsed[0].message_name).toBe('HEARTBEAT')
    })
  })

  describe('Cross-Dialect Error Handling', () => {
    test('should handle message types not supported by dialect', () => {
      const minimalParser = new MinimalParser()
      const commonSerializer = new CommonSerializer()

      // SYS_STATUS exists in common but not in minimal
      const commonMessage = {
        message_name: 'SYS_STATUS',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        payload: {
          onboard_control_sensors_present: 0xff,
          onboard_control_sensors_enabled: 0xff,
          onboard_control_sensors_health: 0xff,
          load: 500,
          voltage_battery: 12000,
          current_battery: 1000,
          battery_remaining: 80,
          drop_rate_comm: 0,
          errors_comm: 0,
          errors_count1: 0,
          errors_count2: 0,
          errors_count3: 0,
          errors_count4: 0,
        },
      }

      const bytes = commonSerializer.serialize(commonMessage)
      const parsed = minimalParser.parseBytes(bytes)

      expect(parsed).toHaveLength(1)
      expect(parsed[0].message_name).toMatch(/^UNKNOWN_/)
      expect(parsed[0].message_id).toBe(1) // SYS_STATUS message ID
    })

    test('should handle unknown message IDs gracefully', () => {
      const parser = new CommonParser()

      // Manually create a frame with an unknown message ID
      const unknownFrame = new Uint8Array([
        0xfd, // Magic v2
        0x05, // Length
        0x00,
        0x00, // Flags
        0x00, // Sequence
        0x01, // System ID
        0x01, // Component ID
        0xff,
        0xff,
        0xff, // Message ID 0xFFFFFF (unknown)
        0x01,
        0x02,
        0x03,
        0x04,
        0x05, // Payload
        0x34,
        0x12, // Checksum
      ])

      const parsed = parser.parseBytes(unknownFrame)

      expect(parsed).toHaveLength(1)
      expect(parsed[0].message_name).toBe('UNKNOWN_16777215')
      expect(parsed[0].message_id).toBe(16777215)
      expect(parsed[0].payload.raw_payload).toEqual([1, 2, 3, 4, 5])
    })
  })

  describe('Serialization Error Conditions', () => {
    let serializer: CommonSerializer

    beforeEach(() => {
      serializer = new CommonSerializer()
    })

    test('should throw error for unknown message types', () => {
      const invalidMessage = {
        message_name: 'NONEXISTENT_MESSAGE',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        payload: {},
      }

      expect(() => {
        serializer.serialize(invalidMessage)
      }).toThrow('Unknown message type: NONEXISTENT_MESSAGE')
    })

    test('should handle missing required fields gracefully', () => {
      const incompleteMessage = {
        message_name: 'HEARTBEAT',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        payload: {},
      }

      const bytes = serializer.serialize(incompleteMessage)
      const parser = new CommonParser()
      const parsed = parser.parseBytes(bytes)

      expect(parsed).toHaveLength(1)
      expect(parsed[0].message_name).toBe('HEARTBEAT')
      // Fields should have default values
      expect(parsed[0].payload.type).toBe(0)
      expect(parsed[0].payload.autopilot).toBe(0)
    })

    test('should handle type coercion for numeric fields', () => {
      const message = {
        message_name: 'HEARTBEAT',
        system_id: '1', // String instead of number,
        component_id: 1.5, // Float instead of integer,
        sequence: true, // Boolean instead of number,
        payload: {
          type: 6,
          autopilot: 8,
          base_mode: 81,
          custom_mode: 12345,
          system_status: 4,
          mavlink_version: 3,
        },
      } as any // Bypass TypeScript checking

      const bytes = serializer.serialize(message)
      const parser = new CommonParser()
      const parsed = parser.parseBytes(bytes)

      expect(parsed).toHaveLength(1)
      expect(parsed[0].message_name).toBe('HEARTBEAT')
      expect(parsed[0].system_id).toBe(1)
      expect(parsed[0].component_id).toBe(1)
      expect(parsed[0].payload.type).toBe(6)
      expect(parsed[0].payload.custom_mode).toBe(12345)
    })
  })
})
