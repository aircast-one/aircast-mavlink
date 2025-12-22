import { describe, it, expect } from '@jest/globals'
import { CommonSerializer, CommonParser } from '../../src/generated/dialects/common'

describe('Node-MAVLink Compatibility Tests', () => {
  const commonSerializer = new CommonSerializer()
  const commonParser = new CommonParser()

  describe('Array Field Ordering', () => {
    it('should serialize PROTOCOL_VERSION with correct field order', () => {
      // PROTOCOL_VERSION fields per MAVLink XML:
      // - version: uint16_t (element size 2)
      // - min_version: uint16_t (element size 2)
      // - max_version: uint16_t (element size 2)
      // - spec_version_hash: uint8_t[8] (element size 1)
      // - library_version_hash: uint8_t[8] (element size 1)
      //
      // Wire order (sorted by element size, descending):
      // 1. version, min_version, max_version at offset 0-5 (uint16_t, 2 bytes each)
      // 2. spec_version_hash at offset 6-13 (uint8_t[8], element size 1)
      // 3. library_version_hash at offset 14-21 (uint8_t[8], element size 1)
      const message = {
        message_name: 'PROTOCOL_VERSION',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        payload: {
          version: 200,
          min_version: 100,
          max_version: 300,
          spec_version_hash: [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x11, 0x22],
          library_version_hash: [0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa],
        },
      }

      const frame = commonSerializer.serialize(message)

      // Extract payload based on MAVLink version
      let payload: Buffer
      if (frame[0] === 0xfd) {
        // MAVLink v2: skip 10-byte header and 2-byte checksum
        payload = Buffer.from(frame.slice(10, -2))
      } else {
        // MAVLink v1: skip 6-byte header and 2-byte checksum
        payload = Buffer.from(frame.slice(6, -2))
      }

      expect(payload.length).toBe(22)

      // uint16_t fields first (element size 2)
      expect(payload.readUInt16LE(0)).toBe(200) // version
      expect(payload.readUInt16LE(2)).toBe(100) // min_version
      expect(payload.readUInt16LE(4)).toBe(300) // max_version

      // uint8_t arrays after (element size 1)
      expect(Array.from(payload.slice(6, 14))).toEqual([
        0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x11, 0x22,
      ]) // spec_version_hash

      expect(Array.from(payload.slice(14, 22))).toEqual([
        0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa,
      ]) // library_version_hash
    })

    it('should parse PROTOCOL_VERSION with correct field order', () => {
      // Create a frame with known values in wire format order
      // Wire order: uint16_t fields first, then uint8_t arrays
      const payload = Buffer.alloc(22)

      // uint16_t fields first (element size 2)
      payload.writeUInt16LE(250, 0) // version
      payload.writeUInt16LE(150, 2) // min_version
      payload.writeUInt16LE(350, 4) // max_version

      // uint8_t arrays after (element size 1)
      payload.set([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08], 6) // spec_version_hash
      payload.set([0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18], 14) // library_version_hash

      const frame = {
        magic: 0xfe,
        length: 22,
        sequence: 0,
        system_id: 1,
        component_id: 1,
        message_id: 300,
        payload: new Uint8Array(payload),
        checksum: 0x0000,
        crc_ok: true,
        protocol_version: 1 as const,
      }

      const decoded = commonParser.decode(frame)

      expect(decoded.message_name).toBe('PROTOCOL_VERSION')
      expect(decoded.payload.version).toBe(250)
      expect(decoded.payload.min_version).toBe(150)
      expect(decoded.payload.max_version).toBe(350)
      expect(decoded.payload.spec_version_hash).toEqual([
        0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
      ])
      expect(decoded.payload.library_version_hash).toEqual([
        0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18,
      ])
    })

    it('should handle PARAM_VALUE with char array', () => {
      const message = {
        message_name: 'PARAM_VALUE',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        payload: {
          param_id: 'RATE_PIT_P',
          param_value: 0.15,
          param_type: 9, // MAV_PARAM_TYPE_REAL32
          param_count: 300,
          param_index: 42,
        },
      }

      const frame = commonSerializer.serialize(message)
      const payload = Buffer.from(frame.slice(6, -2))

      // Expected field order by ELEMENT type size (per MAVLink spec):
      // Arrays are sorted by element type, not total array size!
      // See: https://mavlink.io/en/guide/serialization.html#field_reordering
      // 1. param_value: float = 4 bytes (element size 4)
      // 2. param_count: uint16_t = 2 bytes (element size 2)
      // 3. param_index: uint16_t = 2 bytes (element size 2)
      // 4. param_id: char[16] = 16 bytes (element size 1!)
      // 5. param_type: uint8_t = 1 byte (element size 1)

      expect(payload.length).toBe(25)

      // param_value at bytes 0-3 (float)
      expect(payload.readFloatLE(0)).toBeCloseTo(0.15)

      // param_count at bytes 4-5 (uint16_t)
      expect(payload.readUInt16LE(4)).toBe(300)

      // param_index at bytes 6-7 (uint16_t)
      expect(payload.readUInt16LE(6)).toBe(42)

      // param_id at bytes 8-23 (null-padded string)
      const paramId = Buffer.from(payload.slice(8, 24)).toString('utf8').replace(/\0+$/, '')
      expect(paramId).toBe('RATE_PIT_P')

      // param_type at byte 24
      expect(payload[24]).toBe(9)
    })
  })

  describe('Mixed Array Sizes', () => {
    it('should correctly order fields by ELEMENT type size (not total array size)', () => {
      // Test with a hypothetical message that has multiple arrays
      // Per MAVLink spec: arrays are sorted by element type, not total size!
      // See: https://mavlink.io/en/guide/serialization.html#field_reordering
      const fields = [
        { name: 'small_array', type: 'uint8_t[5]', elementSize: 1 },
        { name: 'large_array', type: 'uint8_t[20]', elementSize: 1 },
        { name: 'medium_array', type: 'uint16_t[4]', elementSize: 2 },
        { name: 'single_int', type: 'uint32_t', elementSize: 4 },
        { name: 'single_byte', type: 'uint8_t', elementSize: 1 },
      ]

      // Expected order by ELEMENT type size (descending), then stable sort for same size
      const expectedOrder = [
        'single_int', // uint32_t element size 4
        'medium_array', // uint16_t element size 2
        'small_array', // uint8_t element size 1 (comes before large_array due to stable sort)
        'large_array', // uint8_t element size 1
        'single_byte', // uint8_t element size 1
      ]

      // Sort by element size descending (stable sort preserves original order for same size)
      const sorted = [...fields].sort((a, b) => b.elementSize - a.elementSize)
      const actualOrder = sorted.map((f) => f.name)

      expect(actualOrder).toEqual(expectedOrder)
    })
  })

  describe('Real-world Message Tests', () => {
    it('should handle GPS_RAW_INT correctly', () => {
      const message = {
        message_name: 'GPS_RAW_INT',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        payload: {
          time_usec: '1234567890123456',
          fix_type: 3,
          lat: 473977420,
          lon: 853452000,
          alt: 100000,
          eph: 150,
          epv: 200,
          vel: 500,
          cog: 1800,
          satellites_visible: 12,
        },
      }

      const frame = commonSerializer.serialize(message)
      const payload = Buffer.from(frame.slice(6, -2))

      // GPS_RAW_INT field sizes:
      // time_usec: uint64_t = 8 bytes (largest)
      // lat, lon, alt: int32_t = 4 bytes each
      // eph, epv, vel, cog: uint16_t = 2 bytes each
      // fix_type, satellites_visible: uint8_t = 1 byte each

      // Verify time_usec comes first (8 bytes)
      const timeUsec = payload.readBigUInt64LE(0)
      expect(timeUsec.toString()).toBe('1234567890123456')

      // Then int32_t fields
      expect(payload.readInt32LE(8)).toBe(473977420) // lat
      expect(payload.readInt32LE(12)).toBe(853452000) // lon
      expect(payload.readInt32LE(16)).toBe(100000) // alt
    })

    it('should handle HEARTBEAT correctly', () => {
      const message = {
        message_name: 'HEARTBEAT',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        payload: {
          type: 2,
          autopilot: 3,
          base_mode: 81,
          custom_mode: 10000,
          system_status: 4,
          mavlink_version: 3,
        },
      }

      const frame = commonSerializer.serialize(message)
      const payload = Buffer.from(frame.slice(6, -2))

      // HEARTBEAT should have custom_mode (uint32_t) first
      expect(payload.readUInt32LE(0)).toBe(10000)

      // Then uint8_t fields
      expect(payload[4]).toBe(2) // type
      expect(payload[5]).toBe(3) // autopilot
      expect(payload[6]).toBe(81) // base_mode
      expect(payload[7]).toBe(4) // system_status
      expect(payload[8]).toBe(3) // mavlink_version
    })
  })
})
