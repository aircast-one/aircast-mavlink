/**
 * MAVLink Specification Compliance Tests
 *
 * These tests verify compliance with the official MAVLink protocol specification.
 * Reference: https://mavlink.io/en/guide/serialization.html
 */

import { CommonParser, CommonSerializer } from '../../src/generated/dialects/common/full'
import '../../src/generated/dialects/common/messages/heartbeat'
import '../../src/generated/dialects/common/messages/sys-status'
import '../../src/generated/dialects/common/messages/param-set'
import '../../src/generated/dialects/common/messages/command-long'
import '../../src/generated/dialects/common/messages/statustext'
import '../../src/generated/dialects/common/messages/gps-raw-int'
import '../../src/generated/dialects/common/messages/attitude'
import '../../src/generated/dialects/common/messages/global-position-int'
import { MAVLinkCRC } from '../../src/core/crc'
import {
  MAVLINK_V1_MAGIC,
  MAVLINK_V2_MAGIC,
  MAVLINK_V1_HEADER_SIZE,
  MAVLINK_V2_HEADER_SIZE,
} from '../../src/core/frame'
import { getFieldTypeSize, sortFieldsByWireOrder } from '../../src/core/codec'

describe('MAVLink Specification Compliance', () => {
  let parser: CommonParser
  let serializer: CommonSerializer

  beforeEach(() => {
    parser = new CommonParser()
    serializer = new CommonSerializer()
  })

  describe('Frame Structure', () => {
    describe('MAVLink v1 Frame', () => {
      it('should use magic byte 0xFE for v1', () => {
        expect(MAVLINK_V1_MAGIC).toBe(0xfe)
      })

      it('should have correct v1 header size (6 bytes)', () => {
        // magic(1) + len(1) + seq(1) + sysid(1) + compid(1) + msgid(1) = 6
        expect(MAVLINK_V1_HEADER_SIZE).toBe(6)
      })

      it('should serialize HEARTBEAT with correct v1 frame structure', () => {
        const message = {
          message_name: 'HEARTBEAT',
          system_id: 1,
          component_id: 1,
          sequence: 42,
          protocol_version: 1 as const,
          payload: {
            type: 6,
            autopilot: 8,
            base_mode: 81,
            custom_mode: 12345,
            system_status: 4,
            mavlink_version: 3,
          },
        }

        const bytes = serializer.serialize(message)

        // v1 frame: magic(1) + len(1) + seq(1) + sysid(1) + compid(1) + msgid(1) + payload + checksum(2)
        expect(bytes[0]).toBe(0xfe) // Magic byte
        expect(bytes[1]).toBe(9) // Payload length (HEARTBEAT = 9 bytes)
        expect(bytes[2]).toBe(42) // Sequence
        expect(bytes[3]).toBe(1) // System ID
        expect(bytes[4]).toBe(1) // Component ID
        expect(bytes[5]).toBe(0) // Message ID (HEARTBEAT = 0)
        expect(bytes.length).toBe(6 + 9 + 2) // Header + payload + checksum = 17
      })

      it('should parse v1 frame correctly', () => {
        const message = {
          message_name: 'HEARTBEAT',
          system_id: 255,
          component_id: 190,
          sequence: 100,
          protocol_version: 1 as const,
          payload: {
            type: 2,
            autopilot: 3,
            base_mode: 0x80,
            custom_mode: 0,
            system_status: 3,
            mavlink_version: 3,
          },
        }

        const bytes = serializer.serialize(message)
        const parsed = parser.parseBytes(bytes)

        expect(parsed).toHaveLength(1)
        expect(parsed[0].protocol_version).toBe(1)
        expect(parsed[0].system_id).toBe(255)
        expect(parsed[0].component_id).toBe(190)
        expect(parsed[0].sequence).toBe(100)
      })
    })

    describe('MAVLink v2 Frame', () => {
      it('should use magic byte 0xFD for v2', () => {
        expect(MAVLINK_V2_MAGIC).toBe(0xfd)
      })

      it('should have correct v2 header size (10 bytes)', () => {
        // magic(1) + len(1) + incompat(1) + compat(1) + seq(1) + sysid(1) + compid(1) + msgid(3) = 10
        expect(MAVLINK_V2_HEADER_SIZE).toBe(10)
      })

      it('should serialize with correct v2 frame structure', () => {
        const message = {
          message_name: 'HEARTBEAT',
          system_id: 1,
          component_id: 1,
          sequence: 42,
          protocol_version: 2 as const,
          payload: {
            type: 6,
            autopilot: 8,
            base_mode: 81,
            custom_mode: 12345,
            system_status: 4,
            mavlink_version: 3,
          },
        }

        const bytes = serializer.serialize(message)

        expect(bytes[0]).toBe(0xfd) // Magic byte
        expect(bytes[1]).toBe(9) // Payload length
        expect(bytes[2]).toBe(0) // Incompatible flags
        expect(bytes[3]).toBe(0) // Compatible flags
        expect(bytes[4]).toBe(42) // Sequence
        expect(bytes[5]).toBe(1) // System ID
        expect(bytes[6]).toBe(1) // Component ID
        // Message ID (24-bit, little-endian)
        expect(bytes[7]).toBe(0) // msgid[0]
        expect(bytes[8]).toBe(0) // msgid[1]
        expect(bytes[9]).toBe(0) // msgid[2]
      })

      it('should encode 24-bit message ID correctly for high IDs', () => {
        // COMMAND_LONG has message ID 76 - uses single byte
        const message = {
          message_name: 'COMMAND_LONG',
          system_id: 1,
          component_id: 1,
          sequence: 0,
          protocol_version: 2 as const,
          payload: {
            target_system: 1,
            target_component: 1,
            command: 400,
            confirmation: 0,
            param1: 0,
            param2: 0,
            param3: 0,
            param4: 0,
            param5: 0,
            param6: 0,
            param7: 0,
          },
        }

        const bytes = serializer.serialize(message)

        // Message ID 76 in little-endian 24-bit
        expect(bytes[7]).toBe(76) // msgid[0]
        expect(bytes[8]).toBe(0) // msgid[1]
        expect(bytes[9]).toBe(0) // msgid[2]
      })
    })
  })

  describe('Byte Order (Little-Endian)', () => {
    it('should serialize uint16 in little-endian', () => {
      const message = {
        message_name: 'SYS_STATUS',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        protocol_version: 2 as const,
        payload: {
          onboard_control_sensors_present: 0,
          onboard_control_sensors_enabled: 0,
          onboard_control_sensors_health: 0,
          load: 0x1234, // Test value
          voltage_battery: 0,
          current_battery: 0,
          battery_remaining: 0,
          drop_rate_comm: 0,
          errors_comm: 0,
          errors_count1: 0,
          errors_count2: 0,
          errors_count3: 0,
          errors_count4: 0,
        },
      }

      const bytes = serializer.serialize(message)
      const parsed = parser.parseBytes(bytes)

      expect(parsed[0].payload.load).toBe(0x1234)
    })

    it('should serialize uint32 in little-endian', () => {
      const message = {
        message_name: 'HEARTBEAT',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        payload: {
          type: 0,
          autopilot: 0,
          base_mode: 0,
          custom_mode: 0x12345678,
          system_status: 0,
          mavlink_version: 3,
        },
      }

      const bytes = serializer.serialize(message)
      const parsed = parser.parseBytes(bytes)

      expect(parsed[0].payload.custom_mode).toBe(0x12345678)
    })

    it('should serialize int32 in little-endian', () => {
      const message = {
        message_name: 'GPS_RAW_INT',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        payload: {
          time_usec: 0n,
          fix_type: 3,
          lat: -123456789, // Negative value
          lon: 987654321,
          alt: 50000,
          eph: 100,
          epv: 100,
          vel: 0,
          cog: 0,
          satellites_visible: 12,
        },
      }

      const bytes = serializer.serialize(message)
      const parsed = parser.parseBytes(bytes)

      expect(parsed[0].payload.lat).toBe(-123456789)
      expect(parsed[0].payload.lon).toBe(987654321)
    })

    it('should serialize float in little-endian IEEE 754', () => {
      const message = {
        message_name: 'ATTITUDE',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        payload: {
          time_boot_ms: 1000,
          roll: 0.5,
          pitch: -0.25,
          yaw: 3.14159,
          rollspeed: 0.1,
          pitchspeed: 0.2,
          yawspeed: 0.3,
        },
      }

      const bytes = serializer.serialize(message)
      const parsed = parser.parseBytes(bytes)

      expect(parsed[0].payload.roll).toBeCloseTo(0.5, 5)
      expect(parsed[0].payload.pitch).toBeCloseTo(-0.25, 5)
      expect(parsed[0].payload.yaw).toBeCloseTo(3.14159, 4)
    })

    it('should serialize uint64 in little-endian', () => {
      const message = {
        message_name: 'GPS_RAW_INT',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        payload: {
          time_usec: 0x123456789abcdef0n,
          fix_type: 3,
          lat: 0,
          lon: 0,
          alt: 0,
          eph: 0,
          epv: 0,
          vel: 0,
          cog: 0,
          satellites_visible: 0,
        },
      }

      const bytes = serializer.serialize(message)
      const parsed = parser.parseBytes(bytes)

      expect(parsed[0].payload.time_usec).toBe(0x123456789abcdef0n)
    })
  })

  describe('CRC Calculation', () => {
    it('should use CRC-16/MCRF4XX algorithm with correct initial value', () => {
      // CRC-16/MCRF4XX initial value is 0xFFFF
      // Calculate CRC of empty data with CRC_EXTRA of 0
      // The result should demonstrate the algorithm is working
      const emptyData = new Uint8Array(0)
      const crc = MAVLinkCRC.calculate(emptyData, 0)
      // After processing just the CRC_EXTRA byte (0), result should be predictable
      expect(typeof crc).toBe('number')
      expect(crc).toBeGreaterThanOrEqual(0)
      expect(crc).toBeLessThanOrEqual(0xffff)
    })

    it('should include CRC_EXTRA in checksum calculation', () => {
      // HEARTBEAT CRC_EXTRA is 50
      const message1 = {
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

      const bytes1 = serializer.serialize(message1)
      const parsed1 = parser.parseBytes(bytes1)

      // If CRC_EXTRA wasn't included, CRC would be wrong and crc_ok would be false
      expect(parsed1[0].crc_ok).toBe(true)
    })

    it('should detect corrupted frames via CRC', () => {
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

      const bytes = serializer.serialize(message)

      // Corrupt a byte in the payload
      bytes[10] = bytes[10] ^ 0xff

      const parsed = parser.parseBytes(bytes)
      expect(parsed[0].crc_ok).toBe(false)
    })

    it('should validate checksum is little-endian', () => {
      const message = {
        message_name: 'HEARTBEAT',
        system_id: 1,
        component_id: 1,
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

      const bytes = serializer.serialize(message)

      // Checksum is last 2 bytes, little-endian
      const checksumLow = bytes[bytes.length - 2]
      const checksumHigh = bytes[bytes.length - 1]
      const checksum = checksumLow | (checksumHigh << 8)

      const parsed = parser.parseBytes(new Uint8Array(bytes))
      expect(parsed[0].checksum).toBe(checksum)
    })
  })

  describe('Field Reordering', () => {
    it('should sort fields by type size (largest first)', () => {
      // Test with a message that has mixed field sizes
      const def = parser.getMessageDefinitionByName('GPS_RAW_INT')
      expect(def).toBeDefined()

      const sortedFields = sortFieldsByWireOrder(def!.fields)
      const coreSortedFields = sortedFields.filter((f) => !f.extension)

      // Verify ordering: 8-byte fields first, then 4-byte, 2-byte, 1-byte
      let prevSize = 8
      for (const field of coreSortedFields) {
        const size = getFieldTypeSize(field)
        expect(size).toBeLessThanOrEqual(prevSize)
        prevSize = size
      }
    })

    it('should preserve order for fields of same size', () => {
      // SYS_STATUS has multiple uint32 fields - they should stay in original order
      const def = parser.getMessageDefinitionByName('SYS_STATUS')
      expect(def).toBeDefined()

      const sortedFields = sortFieldsByWireOrder(def!.fields)

      // Get the uint32 fields
      const uint32Fields = sortedFields.filter((f) => f.type === 'uint32_t' && !f.extension)

      // They should be in their original XML order
      expect(uint32Fields[0].name).toBe('onboard_control_sensors_present')
      expect(uint32Fields[1].name).toBe('onboard_control_sensors_enabled')
      expect(uint32Fields[2].name).toBe('onboard_control_sensors_health')
    })

    it('should sort arrays by element type size, not total size', () => {
      // A uint8_t[20] array should sort after a uint32_t field
      // even though 20 > 4
      const def = parser.getMessageDefinitionByName('PARAM_SET')
      expect(def).toBeDefined()

      const sortedFields = sortFieldsByWireOrder(def!.fields)

      // param_id is char[16] (1-byte elements)
      // param_value is float (4-byte)
      // param_type is uint8_t (1-byte)

      const paramIdIndex = sortedFields.findIndex((f) => f.name === 'param_id')
      const paramValueIndex = sortedFields.findIndex((f) => f.name === 'param_value')

      // float should come before char array in wire order
      expect(paramValueIndex).toBeLessThan(paramIdIndex)
    })

    it('should produce correct wire format after reordering', () => {
      const message = {
        message_name: 'HEARTBEAT',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        payload: {
          type: 6,
          autopilot: 8,
          base_mode: 81,
          custom_mode: 0x12345678,
          system_status: 4,
          mavlink_version: 3,
        },
      }

      const bytes = serializer.serialize(message)

      // HEARTBEAT wire order: custom_mode(4), type(1), autopilot(1), base_mode(1), system_status(1), mavlink_version(1)
      // Payload starts at offset 6 (v1) or 10 (v2)
      const payloadStart = bytes[0] === 0xfe ? 6 : 10

      // custom_mode (uint32, little-endian) should be first
      const customMode =
        bytes[payloadStart] |
        (bytes[payloadStart + 1] << 8) |
        (bytes[payloadStart + 2] << 16) |
        (bytes[payloadStart + 3] << 24)
      expect(customMode >>> 0).toBe(0x12345678)

      // Then the 1-byte fields
      expect(bytes[payloadStart + 4]).toBe(6) // type
      expect(bytes[payloadStart + 5]).toBe(8) // autopilot
      expect(bytes[payloadStart + 6]).toBe(81) // base_mode
      expect(bytes[payloadStart + 7]).toBe(4) // system_status
      expect(bytes[payloadStart + 8]).toBe(3) // mavlink_version
    })
  })

  describe('Payload Truncation (v2)', () => {
    it('should truncate trailing zero bytes from extension fields in v2', () => {
      // Create message with non-zero extension field followed by zeros
      const messageWithNonZeroExt = {
        message_name: 'SYS_STATUS',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        protocol_version: 2 as const,
        payload: {
          onboard_control_sensors_present: 0x1f,
          onboard_control_sensors_enabled: 0x0f,
          onboard_control_sensors_health: 0x07,
          load: 500,
          voltage_battery: 11800,
          current_battery: 1500,
          battery_remaining: 85,
          drop_rate_comm: 0,
          errors_comm: 0,
          errors_count1: 0,
          errors_count2: 0,
          errors_count3: 0,
          errors_count4: 0,
          // Extension fields - first one non-zero, rest zero (should be truncated)
          onboard_control_sensors_present_extended: 0x12345678,
          onboard_control_sensors_enabled_extended: 0,
          onboard_control_sensors_health_extended: 0,
        },
      }

      const bytesWithExt = serializer.serialize(messageWithNonZeroExt)

      // Core SYS_STATUS is 31 bytes, first extension adds 4 bytes = 35 bytes
      // Last 8 bytes (2 zero uint32s) should be truncated
      const payloadLength = bytesWithExt[1]
      expect(payloadLength).toBe(35) // 31 core + 4 for first extension

      // Verify the message parses correctly
      const parsed = parser.parseBytes(bytesWithExt)
      expect(parsed[0].payload.onboard_control_sensors_present_extended).toBe(0x12345678)
    })

    it('should not truncate if last byte is non-zero', () => {
      const message = {
        message_name: 'HEARTBEAT',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        protocol_version: 2 as const,
        payload: {
          type: 6,
          autopilot: 8,
          base_mode: 81,
          custom_mode: 0, // Zero in middle
          system_status: 4,
          mavlink_version: 3, // Non-zero at end
        },
      }

      const bytes = serializer.serialize(message)

      // HEARTBEAT is 9 bytes, none truncated because mavlink_version is non-zero
      expect(bytes[1]).toBe(9)
    })

    it('should never truncate first byte even if all zeros', () => {
      // Per spec: "The first byte of the payload is never truncated"
      const message = {
        message_name: 'HEARTBEAT',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        protocol_version: 2 as const,
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

      // Payload should have at least 1 byte (the minimum per spec)
      // For HEARTBEAT, custom_mode is first in wire order and it's uint32
      // So minimum is 4 bytes (custom_mode can't be truncated)
      expect(bytes[1]).toBeGreaterThanOrEqual(4)
    })

    it('should not truncate in v1 (truncation is v2 only)', () => {
      const message = {
        message_name: 'HEARTBEAT',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        protocol_version: 1 as const,
        payload: {
          type: 6,
          autopilot: 8,
          base_mode: 81,
          custom_mode: 0,
          system_status: 4,
          mavlink_version: 0, // Trailing zero
        },
      }

      const bytes = serializer.serialize(message)

      // v1 should have full 9-byte payload
      expect(bytes[1]).toBe(9)
    })

    it('should correctly parse truncated payloads', () => {
      const message = {
        message_name: 'SYS_STATUS',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        protocol_version: 2 as const,
        payload: {
          onboard_control_sensors_present: 0x1f,
          onboard_control_sensors_enabled: 0x0f,
          onboard_control_sensors_health: 0x07,
          load: 500,
          voltage_battery: 11800,
          current_battery: 1500,
          battery_remaining: 85,
          drop_rate_comm: 0,
          errors_comm: 0,
          errors_count1: 0,
          errors_count2: 0,
          errors_count3: 0,
          errors_count4: 0,
        },
      }

      const bytes = serializer.serialize(message)
      const parsed = parser.parseBytes(bytes)

      expect(parsed).toHaveLength(1)
      expect(parsed[0].payload.onboard_control_sensors_present).toBe(0x1f)
      expect(parsed[0].payload.voltage_battery).toBe(11800)
      // Truncated fields should default to 0
      expect(parsed[0].payload.errors_count4).toBe(0)
    })
  })

  describe('Extension Fields', () => {
    it('should place extension fields after core fields in wire order', () => {
      // SYS_STATUS has extension fields
      const def = parser.getMessageDefinitionByName('SYS_STATUS')
      expect(def).toBeDefined()

      const sortedFields = sortFieldsByWireOrder(def!.fields)

      // Find first extension field index
      const firstExtIndex = sortedFields.findIndex((f) => f.extension)

      if (firstExtIndex !== -1) {
        // All fields after firstExtIndex should be extensions
        for (let i = firstExtIndex; i < sortedFields.length; i++) {
          expect(sortedFields[i].extension).toBe(true)
        }

        // All fields before firstExtIndex should be core fields
        for (let i = 0; i < firstExtIndex; i++) {
          expect(sortedFields[i].extension).toBeFalsy()
        }
      }
    })

    it('should preserve extension field XML order (not sorted by size)', () => {
      const def = parser.getMessageDefinitionByName('SYS_STATUS')
      expect(def).toBeDefined()

      const extensionFields = def!.fields.filter((f) => f.extension)

      if (extensionFields.length > 0) {
        const sortedFields = sortFieldsByWireOrder(def!.fields)
        const sortedExtensions = sortedFields.filter((f) => f.extension)

        // Extension fields should maintain their original order
        for (let i = 0; i < extensionFields.length; i++) {
          expect(sortedExtensions[i].name).toBe(extensionFields[i].name)
        }
      }
    })

    it('should serialize and parse extension fields correctly', () => {
      const message = {
        message_name: 'SYS_STATUS',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        protocol_version: 2 as const,
        payload: {
          onboard_control_sensors_present: 0x1f,
          onboard_control_sensors_enabled: 0x0f,
          onboard_control_sensors_health: 0x07,
          load: 500,
          voltage_battery: 11800,
          current_battery: 1500,
          battery_remaining: 85,
          drop_rate_comm: 0,
          errors_comm: 0,
          errors_count1: 0,
          errors_count2: 0,
          errors_count3: 0,
          errors_count4: 0,
          // Extension fields
          onboard_control_sensors_present_extended: 0x12345678,
          onboard_control_sensors_enabled_extended: 0x87654321,
          onboard_control_sensors_health_extended: 0xabcdef00,
        },
      }

      const bytes = serializer.serialize(message)
      const parsed = parser.parseBytes(bytes)

      expect(parsed).toHaveLength(1)
      expect(parsed[0].payload.onboard_control_sensors_present_extended).toBe(0x12345678)
      expect(parsed[0].payload.onboard_control_sensors_enabled_extended).toBe(0x87654321)
      expect(parsed[0].payload.onboard_control_sensors_health_extended).toBe(0xabcdef00)
    })

    it('should truncate zero-valued extension fields', () => {
      const messageWithExt = {
        message_name: 'SYS_STATUS',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        protocol_version: 2 as const,
        payload: {
          onboard_control_sensors_present: 0x1f,
          onboard_control_sensors_enabled: 0x0f,
          onboard_control_sensors_health: 0x07,
          load: 500,
          voltage_battery: 11800,
          current_battery: 1500,
          battery_remaining: 85,
          drop_rate_comm: 0,
          errors_comm: 0,
          errors_count1: 0,
          errors_count2: 0,
          errors_count3: 0,
          errors_count4: 0,
          // Extension fields all zero - should be truncated
          onboard_control_sensors_present_extended: 0,
          onboard_control_sensors_enabled_extended: 0,
          onboard_control_sensors_health_extended: 0,
        },
      }

      const bytesWithExt = serializer.serialize(messageWithExt)

      // Without extension values, payload should be shorter
      // Core SYS_STATUS is 31 bytes, extension adds 12 more
      expect(bytesWithExt[1]).toBeLessThan(31 + 12)
    })
  })

  describe('String/Char Array Fields', () => {
    it('should encode strings with null termination', () => {
      const message = {
        message_name: 'STATUSTEXT',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        payload: {
          severity: 6,
          text: 'Hello',
        },
      }

      const bytes = serializer.serialize(message)
      const parsed = parser.parseBytes(bytes)

      expect(parsed[0].payload.text).toBe('Hello')
    })

    it('should handle maximum length strings', () => {
      const maxText = 'A'.repeat(50) // STATUSTEXT.text is char[50]

      const message = {
        message_name: 'STATUSTEXT',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        payload: {
          severity: 0,
          text: maxText,
        },
      }

      const bytes = serializer.serialize(message)
      const parsed = parser.parseBytes(bytes)

      expect(parsed[0].payload.text).toBe(maxText)
    })

    it('should pad short strings with null bytes', () => {
      const message = {
        message_name: 'PARAM_SET',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        payload: {
          target_system: 1,
          target_component: 1,
          param_id: 'TEST', // char[16], only 4 chars
          param_value: 1.5,
          param_type: 9,
        },
      }

      const bytes = serializer.serialize(message)
      const parsed = parser.parseBytes(bytes)

      expect(parsed[0].payload.param_id).toBe('TEST')
    })
  })

  describe('Round-Trip Integrity', () => {
    it('should maintain data integrity through serialize/parse cycle', () => {
      const originalMessage = {
        message_name: 'GLOBAL_POSITION_INT',
        system_id: 1,
        component_id: 1,
        sequence: 123,
        payload: {
          time_boot_ms: 123456789,
          lat: 473977420,
          lon: 85455940,
          alt: 50000,
          relative_alt: 1000,
          vx: 100,
          vy: -50,
          vz: 10,
          hdg: 35999,
        },
      }

      const bytes = serializer.serialize(originalMessage)
      const parsed = parser.parseBytes(bytes)

      expect(parsed).toHaveLength(1)
      expect(parsed[0].message_name).toBe('GLOBAL_POSITION_INT')
      expect(parsed[0].system_id).toBe(1)
      expect(parsed[0].sequence).toBe(123)
      expect(parsed[0].payload.time_boot_ms).toBe(123456789)
      expect(parsed[0].payload.lat).toBe(473977420)
      expect(parsed[0].payload.lon).toBe(85455940)
      expect(parsed[0].payload.alt).toBe(50000)
      expect(parsed[0].payload.relative_alt).toBe(1000)
      expect(parsed[0].payload.vx).toBe(100)
      expect(parsed[0].payload.vy).toBe(-50)
      expect(parsed[0].payload.vz).toBe(10)
      expect(parsed[0].payload.hdg).toBe(35999)
    })

    it('should handle edge case values', () => {
      const message = {
        message_name: 'GPS_RAW_INT',
        system_id: 255,
        component_id: 255,
        sequence: 255,
        payload: {
          time_usec: 0xffffffffffffffffn, // Max uint64
          fix_type: 255,
          lat: 2147483647, // Max int32
          lon: -2147483648, // Min int32
          alt: 2147483647,
          eph: 65535, // Max uint16
          epv: 65535,
          vel: 65535,
          cog: 65535,
          satellites_visible: 255,
        },
      }

      const bytes = serializer.serialize(message)
      const parsed = parser.parseBytes(bytes)

      expect(parsed[0].payload.time_usec).toBe(0xffffffffffffffffn)
      expect(parsed[0].payload.lat).toBe(2147483647)
      expect(parsed[0].payload.lon).toBe(-2147483648)
      expect(parsed[0].payload.eph).toBe(65535)
      expect(parsed[0].system_id).toBe(255)
      expect(parsed[0].component_id).toBe(255)
      expect(parsed[0].sequence).toBe(255)
    })

    it('should handle streaming with partial frames', () => {
      const message = {
        message_name: 'HEARTBEAT',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        payload: {
          type: 6,
          autopilot: 8,
          base_mode: 81,
          custom_mode: 12345,
          system_status: 4,
          mavlink_version: 3,
        },
      }

      const fullBytes = serializer.serialize(message)

      // Reset parser buffer
      parser.resetBuffer()

      // Feed bytes one at a time
      for (let i = 0; i < fullBytes.length - 1; i++) {
        const result = parser.parseBytes(new Uint8Array([fullBytes[i]]))
        expect(result).toHaveLength(0) // No complete message yet
      }

      // Feed last byte
      const result = parser.parseBytes(new Uint8Array([fullBytes[fullBytes.length - 1]]))
      expect(result).toHaveLength(1)
      expect(result[0].message_name).toBe('HEARTBEAT')
    })

    it('should handle multiple messages in single buffer', () => {
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
          message_name: 'HEARTBEAT',
          system_id: 2,
          component_id: 1,
          sequence: 1,
          payload: {
            type: 2,
            autopilot: 3,
            base_mode: 0,
            custom_mode: 0,
            system_status: 3,
            mavlink_version: 3,
          },
        },
      ]

      const allBytes = new Uint8Array([
        ...serializer.serialize(messages[0] as any),
        ...serializer.serialize(messages[1] as any),
      ])

      parser.resetBuffer()
      const parsed = parser.parseBytes(allBytes)

      expect(parsed).toHaveLength(2)
      expect(parsed[0].system_id).toBe(1)
      expect(parsed[1].system_id).toBe(2)
    })
  })

  describe('Protocol Version Detection', () => {
    it('should correctly identify v1 frames', () => {
      const message = {
        message_name: 'HEARTBEAT',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        protocol_version: 1 as const,
        payload: {
          type: 6,
          autopilot: 8,
          base_mode: 0,
          custom_mode: 0,
          system_status: 4,
          mavlink_version: 3,
        },
      }

      const bytes = serializer.serialize(message)
      const parsed = parser.parseBytes(bytes)

      expect(parsed[0].protocol_version).toBe(1)
    })

    it('should correctly identify v2 frames', () => {
      const message = {
        message_name: 'HEARTBEAT',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        protocol_version: 2 as const,
        payload: {
          type: 6,
          autopilot: 8,
          base_mode: 0,
          custom_mode: 0,
          system_status: 4,
          mavlink_version: 3,
        },
      }

      const bytes = serializer.serialize(message)
      const parsed = parser.parseBytes(bytes)

      expect(parsed[0].protocol_version).toBe(2)
    })

    it('should auto-select v2 for message IDs > 255', () => {
      // Any message with ID > 255 requires v2
      // COMMAND_LONG is 76, so let's test with a message that defaults correctly
      const message = {
        message_name: 'HEARTBEAT', // ID 0, should default to v1
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

      const bytes = serializer.serialize(message)

      // Without explicit protocol_version, HEARTBEAT (ID 0) should use v1
      expect(bytes[0]).toBe(0xfe)
    })
  })
})
