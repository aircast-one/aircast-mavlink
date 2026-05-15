import { computeCrcExtra } from '../../src/generator/mavlink-crc'

describe('computeCrcExtra', () => {
  test('should compute correct CRC_EXTRA for HEARTBEAT', () => {
    const fields = [
      { name: 'type', type: 'uint8_t' },
      { name: 'autopilot', type: 'uint8_t' },
      { name: 'base_mode', type: 'uint8_t' },
      { name: 'custom_mode', type: 'uint32_t' },
      { name: 'system_status', type: 'uint8_t' },
      { name: 'mavlink_version', type: 'uint8_t_mavlink_version' },
    ]

    expect(computeCrcExtra('HEARTBEAT', fields)).toBe(50)
  })

  test('should compute correct CRC_EXTRA for SYS_STATUS', () => {
    const fields = [
      { name: 'onboard_control_sensors_present', type: 'uint32_t' },
      { name: 'onboard_control_sensors_enabled', type: 'uint32_t' },
      { name: 'onboard_control_sensors_health', type: 'uint32_t' },
      { name: 'load', type: 'uint16_t' },
      { name: 'voltage_battery', type: 'uint16_t' },
      { name: 'current_battery', type: 'int16_t' },
      { name: 'battery_remaining', type: 'int8_t' },
      { name: 'drop_rate_comm', type: 'uint16_t' },
      { name: 'errors_comm', type: 'uint16_t' },
      { name: 'errors_count1', type: 'uint16_t' },
      { name: 'errors_count2', type: 'uint16_t' },
      { name: 'errors_count3', type: 'uint16_t' },
      { name: 'errors_count4', type: 'uint16_t' },
    ]

    expect(computeCrcExtra('SYS_STATUS', fields)).toBe(124)
  })

  test('should compute correct CRC_EXTRA for ATTITUDE', () => {
    const fields = [
      { name: 'time_boot_ms', type: 'uint32_t' },
      { name: 'roll', type: 'float' },
      { name: 'pitch', type: 'float' },
      { name: 'yaw', type: 'float' },
      { name: 'rollspeed', type: 'float' },
      { name: 'pitchspeed', type: 'float' },
      { name: 'yawspeed', type: 'float' },
    ]

    expect(computeCrcExtra('ATTITUDE', fields)).toBe(39)
  })

  test('should compute correct CRC_EXTRA for GPS_RAW_INT (with extensions)', () => {
    const fields = [
      { name: 'time_usec', type: 'uint64_t' },
      { name: 'fix_type', type: 'uint8_t' },
      { name: 'lat', type: 'int32_t' },
      { name: 'lon', type: 'int32_t' },
      { name: 'alt', type: 'int32_t' },
      { name: 'eph', type: 'uint16_t' },
      { name: 'epv', type: 'uint16_t' },
      { name: 'vel', type: 'uint16_t' },
      { name: 'cog', type: 'uint16_t' },
      { name: 'satellites_visible', type: 'uint8_t' },
      { name: 'alt_ellipsoid', type: 'int32_t', extension: true },
      { name: 'h_acc', type: 'uint32_t', extension: true },
      { name: 'v_acc', type: 'uint32_t', extension: true },
      { name: 'vel_acc', type: 'uint32_t', extension: true },
      { name: 'hdg_acc', type: 'uint32_t', extension: true },
      { name: 'yaw', type: 'uint16_t', extension: true },
    ]

    expect(computeCrcExtra('GPS_RAW_INT', fields)).toBe(24)
  })

  test('should compute correct CRC_EXTRA for STATUSTEXT (char array)', () => {
    const fields = [
      { name: 'severity', type: 'uint8_t' },
      { name: 'text', type: 'char[50]' },
      { name: 'id', type: 'uint16_t', extension: true },
      { name: 'chunk_seq', type: 'uint8_t', extension: true },
    ]

    expect(computeCrcExtra('STATUSTEXT', fields)).toBe(83)
  })

  test('should compute correct CRC_EXTRA for COMMAND_LONG', () => {
    const fields = [
      { name: 'target_system', type: 'uint8_t' },
      { name: 'target_component', type: 'uint8_t' },
      { name: 'command', type: 'uint16_t' },
      { name: 'confirmation', type: 'uint8_t' },
      { name: 'param1', type: 'float' },
      { name: 'param2', type: 'float' },
      { name: 'param3', type: 'float' },
      { name: 'param4', type: 'float' },
      { name: 'param5', type: 'float' },
      { name: 'param6', type: 'float' },
      { name: 'param7', type: 'float' },
    ]

    expect(computeCrcExtra('COMMAND_LONG', fields)).toBe(152)
  })

  test('should compute correct CRC_EXTRA for GPS_STATUS (uint8_t arrays)', () => {
    const fields = [
      { name: 'satellites_visible', type: 'uint8_t' },
      { name: 'satellite_prn', type: 'uint8_t[20]' },
      { name: 'satellite_used', type: 'uint8_t[20]' },
      { name: 'satellite_elevation', type: 'uint8_t[20]' },
      { name: 'satellite_azimuth', type: 'uint8_t[20]' },
      { name: 'satellite_snr', type: 'uint8_t[20]' },
    ]

    expect(computeCrcExtra('GPS_STATUS', fields)).toBe(23)
  })

  test('should exclude extension fields from computation', () => {
    const fieldsWithoutExtensions = [
      { name: 'type', type: 'uint8_t' },
      { name: 'autopilot', type: 'uint8_t' },
      { name: 'base_mode', type: 'uint8_t' },
      { name: 'custom_mode', type: 'uint32_t' },
      { name: 'system_status', type: 'uint8_t' },
      { name: 'mavlink_version', type: 'uint8_t_mavlink_version' },
    ]

    const fieldsWithExtensions = [
      ...fieldsWithoutExtensions,
      { name: 'extra_field', type: 'uint32_t', extension: true },
    ]

    expect(computeCrcExtra('HEARTBEAT', fieldsWithoutExtensions)).toBe(
      computeCrcExtra('HEARTBEAT', fieldsWithExtensions)
    )
  })

  test('should produce different values for different message names', () => {
    const fields = [{ name: 'value', type: 'uint32_t' }]
    expect(computeCrcExtra('MSG_A', fields)).not.toBe(computeCrcExtra('MSG_B', fields))
  })

  test('should produce different values for different field types', () => {
    const fieldsUint32 = [{ name: 'value', type: 'uint32_t' }]
    const fieldsFloat = [{ name: 'value', type: 'float' }]
    expect(computeCrcExtra('TEST', fieldsUint32)).not.toBe(computeCrcExtra('TEST', fieldsFloat))
  })

  test('should produce different values for different field names', () => {
    const fieldsA = [{ name: 'alpha', type: 'uint32_t' }]
    const fieldsB = [{ name: 'beta', type: 'uint32_t' }]
    expect(computeCrcExtra('TEST', fieldsA)).not.toBe(computeCrcExtra('TEST', fieldsB))
  })

  test('should include array length in computation', () => {
    const fieldsScalar = [{ name: 'data', type: 'uint8_t' }]
    const fieldsArray = [{ name: 'data', type: 'uint8_t[4]' }]
    expect(computeCrcExtra('TEST', fieldsScalar)).not.toBe(computeCrcExtra('TEST', fieldsArray))
  })

  test('should return value in 0-255 range', () => {
    const result = computeCrcExtra('TEST_MSG', [
      { name: 'type', type: 'uint8_t' },
      { name: 'value', type: 'float' },
    ])
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBeLessThanOrEqual(255)
  })

  test('should handle all MAVLink base types', () => {
    // Each type must produce a valid 0-255 result and not throw
    const allTypes = [
      'uint8_t',
      'int8_t',
      'char',
      'uint8_t_mavlink_version',
      'uint16_t',
      'int16_t',
      'uint32_t',
      'int32_t',
      'float',
      'uint64_t',
      'int64_t',
      'double',
    ]

    for (const type of allTypes) {
      const result = computeCrcExtra('TEST', [{ name: 'field', type }])
      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThanOrEqual(255)
    }
  })

  test('should sort fields by type size for CRC computation', () => {
    // Same fields in different XML order should produce the same CRC_EXTRA
    // because wire order sorts by type size (descending)
    const fieldsOrder1 = [
      { name: 'a', type: 'uint8_t' },
      { name: 'b', type: 'double' },
      { name: 'c', type: 'int16_t' },
    ]
    const fieldsOrder2 = [
      { name: 'b', type: 'double' },
      { name: 'c', type: 'int16_t' },
      { name: 'a', type: 'uint8_t' },
    ]

    expect(computeCrcExtra('TEST', fieldsOrder1)).toBe(computeCrcExtra('TEST', fieldsOrder2))
  })

  test('should throw for unknown MAVLink type', () => {
    const fields = [{ name: 'value', type: 'invalid_type' }]
    expect(() => computeCrcExtra('TEST', fields)).toThrow(
      'Unknown MAVLink type for CRC computation: invalid_type'
    )
  })
})
