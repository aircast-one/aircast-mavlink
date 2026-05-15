/**
 * Serializer ↔ Parser round-trip tests
 * Serialize a message, feed bytes to parser, verify payload matches.
 */
import { CommonParser, CommonSerializer } from '../../src/generated/dialects/common/full'

describe('Serializer ↔ Parser Round-Trip', () => {
  let parser: CommonParser
  let serializer: CommonSerializer

  beforeEach(() => {
    parser = new CommonParser()
    serializer = new CommonSerializer()
  })

  function roundTrip(message: Record<string, unknown> & { message_name: string }) {
    const bytes = serializer.serialize(message)
    const parsed = parser.parseBytes(bytes)
    expect(parsed).toHaveLength(1)
    return parsed[0]
  }

  test('HEARTBEAT — all scalar fields', () => {
    const message = {
      message_name: 'HEARTBEAT',
      system_id: 1,
      component_id: 1,
      sequence: 42,
      payload: {
        type: 6,
        autopilot: 8,
        base_mode: 81,
        custom_mode: 12345,
        system_status: 4,
        mavlink_version: 3,
      },
    }

    const parsed = roundTrip(message)
    expect(parsed.message_name).toBe('HEARTBEAT')
    expect(parsed.system_id).toBe(1)
    expect(parsed.sequence).toBe(42)
    expect(parsed.crc_ok).toBe(true)
    expect(parsed.payload.type).toBe(6)
    expect(parsed.payload.autopilot).toBe(8)
    expect(parsed.payload.base_mode).toBe(81)
    expect(parsed.payload.custom_mode).toBe(12345)
    expect(parsed.payload.system_status).toBe(4)
    expect(parsed.payload.mavlink_version).toBe(3)
  })

  test('ATTITUDE — float fields', () => {
    const message = {
      message_name: 'ATTITUDE',
      system_id: 1,
      component_id: 1,
      sequence: 0,
      payload: {
        time_boot_ms: 100000,
        roll: 0.1,
        pitch: -0.2,
        yaw: 3.14,
        rollspeed: 0.01,
        pitchspeed: -0.02,
        yawspeed: 0.0,
      },
    }

    const parsed = roundTrip(message)
    expect(parsed.message_name).toBe('ATTITUDE')
    expect(parsed.crc_ok).toBe(true)
    expect(parsed.payload.time_boot_ms).toBe(100000)
    expect(parsed.payload.roll).toBeCloseTo(0.1, 5)
    expect(parsed.payload.pitch).toBeCloseTo(-0.2, 5)
    expect(parsed.payload.yaw).toBeCloseTo(3.14, 5)
  })

  test('STATUSTEXT — char array (string field)', () => {
    const message = {
      message_name: 'STATUSTEXT',
      system_id: 1,
      component_id: 1,
      sequence: 0,
      payload: {
        severity: 6,
        text: 'Hello MAVLink',
      },
    }

    const parsed = roundTrip(message)
    expect(parsed.message_name).toBe('STATUSTEXT')
    expect(parsed.crc_ok).toBe(true)
    expect(parsed.payload.severity).toBe(6)
    expect(parsed.payload.text).toBe('Hello MAVLink')
  })

  test('COMMAND_LONG — many float params', () => {
    const message = {
      message_name: 'COMMAND_LONG',
      system_id: 255,
      component_id: 190,
      sequence: 100,
      payload: {
        target_system: 1,
        target_component: 1,
        command: 400,
        confirmation: 0,
        param1: 1.0,
        param2: 0.0,
        param3: 0.0,
        param4: 0.0,
        param5: 0.0,
        param6: 0.0,
        param7: 0.0,
      },
    }

    const parsed = roundTrip(message)
    expect(parsed.message_name).toBe('COMMAND_LONG')
    expect(parsed.crc_ok).toBe(true)
    expect(parsed.system_id).toBe(255)
    expect(parsed.component_id).toBe(190)
    expect(parsed.payload.command).toBe(400)
    expect(parsed.payload.param1).toBeCloseTo(1.0, 5)
    expect(parsed.payload.target_system).toBe(1)
  })

  test('SYSTEM_TIME — uint64_t field', () => {
    const message = {
      message_name: 'SYSTEM_TIME',
      system_id: 1,
      component_id: 1,
      sequence: 0,
      payload: {
        time_unix_usec: BigInt('1620000000000000'),
        time_boot_ms: 500000,
      },
    }

    const parsed = roundTrip(message)
    expect(parsed.message_name).toBe('SYSTEM_TIME')
    expect(parsed.crc_ok).toBe(true)
    expect(parsed.payload.time_unix_usec).toBe(BigInt('1620000000000000'))
    expect(parsed.payload.time_boot_ms).toBe(500000)
  })

  test('SYS_STATUS — many uint16 fields with extension fields', () => {
    const message = {
      message_name: 'SYS_STATUS',
      system_id: 1,
      component_id: 1,
      sequence: 5,
      payload: {
        onboard_control_sensors_present: 31,
        onboard_control_sensors_enabled: 15,
        onboard_control_sensors_health: 7,
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

    const parsed = roundTrip(message)
    expect(parsed.message_name).toBe('SYS_STATUS')
    expect(parsed.crc_ok).toBe(true)
    expect(parsed.payload.voltage_battery).toBe(11800)
    expect(parsed.payload.current_battery).toBe(1500)
    expect(parsed.payload.battery_remaining).toBe(85)
    expect(parsed.payload.load).toBe(500)
  })

  test('GPS_RAW_INT — mixed types with extensions defaulting to zero', () => {
    const message = {
      message_name: 'GPS_RAW_INT',
      system_id: 1,
      component_id: 1,
      sequence: 0,
      payload: {
        time_usec: BigInt(0),
        fix_type: 3,
        lat: 473977420,
        lon: 85455940,
        alt: 48800,
        eph: 121,
        epv: 65535,
        vel: 0,
        cog: 0,
        satellites_visible: 12,
      },
    }

    const parsed = roundTrip(message)
    expect(parsed.message_name).toBe('GPS_RAW_INT')
    expect(parsed.crc_ok).toBe(true)
    expect(parsed.payload.fix_type).toBe(3)
    expect(parsed.payload.lat).toBe(473977420)
    expect(parsed.payload.lon).toBe(85455940)
    expect(parsed.payload.satellites_visible).toBe(12)
  })

  test('v1 and v2 frames produce identical payloads', () => {
    const payload = {
      type: 2,
      autopilot: 3,
      base_mode: 128,
      custom_mode: 0,
      system_status: 3,
      mavlink_version: 3,
    }

    const v1 = roundTrip({
      message_name: 'HEARTBEAT',
      system_id: 1,
      component_id: 1,
      sequence: 0,
      protocol_version: 1,
      payload,
    })

    parser.resetBuffer()

    const v2 = roundTrip({
      message_name: 'HEARTBEAT',
      system_id: 1,
      component_id: 1,
      sequence: 0,
      protocol_version: 2,
      payload,
    })

    expect(v1.payload).toEqual(v2.payload)
    expect(v1.protocol_version).toBe(1)
    expect(v2.protocol_version).toBe(2)
  })
})
