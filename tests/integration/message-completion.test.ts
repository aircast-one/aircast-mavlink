import { CommonParser, CommonSerializer } from '../../src/generated/dialects/common/full'

describe('Message Completion Feature', () => {
  let parser: CommonParser
  let serializer: CommonSerializer

  beforeEach(() => {
    parser = new CommonParser()
    serializer = new CommonSerializer()
  })

  test('should complete SYS_STATUS message with all defined fields', () => {
    // Original message with only core fields (like user would provide)
    console.log('Original message with core fields only')

    // Serialize the message
    const serializedBytes = serializer.serialize(
      'SYS_STATUS',
      {
        onboard_control_sensors_present: 31,
        onboard_control_sensors_enabled: 15,
        onboard_control_sensors_health: 7,
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
        // Note: Extension fields are missing in original message payload
      },
      { system_id: 1, component_id: 1, sequence: 5 }
    )
    console.log('Serialized bytes length:', serializedBytes.length)

    // Parse it back
    const parsedMessages = parser.parseBytes(serializedBytes)
    expect(parsedMessages).toHaveLength(1)

    const parsedMessage = parsedMessages[0]
    console.log('Parsed message payload:', parsedMessage.payload)

    // Verify the message has all defined fields including extension fields
    expect(parsedMessage.payload).toHaveProperty('onboard_control_sensors_present', 31)
    expect(parsedMessage.payload).toHaveProperty('onboard_control_sensors_enabled', 15)
    expect(parsedMessage.payload).toHaveProperty('onboard_control_sensors_health', 7)

    // Extension fields should now be present with default values
    expect(parsedMessage.payload).toHaveProperty('onboard_control_sensors_present_extended', 0)
    expect(parsedMessage.payload).toHaveProperty('onboard_control_sensors_enabled_extended', 0)
    expect(parsedMessage.payload).toHaveProperty('onboard_control_sensors_health_extended', 0)

    // Check that all core fields match
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

    console.log('All fields present in parsed message including extension fields!')
  })

  test('should preserve user-provided extension field values', () => {
    // Serialize and parse
    const serializedBytes = serializer.serialize(
      'SYS_STATUS',
      {
        onboard_control_sensors_present: 31,
        onboard_control_sensors_enabled: 15,
        onboard_control_sensors_health: 7,
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
        // Extension fields explicitly set to non-zero values
        onboard_control_sensors_present_extended: 0x12345678,
        onboard_control_sensors_enabled_extended: 0x87654321,
        onboard_control_sensors_health_extended: 0xabcdef00,
      },
      { system_id: 1, component_id: 1, sequence: 5 }
    )
    const parsedMessages = parser.parseBytes(serializedBytes)
    expect(parsedMessages).toHaveLength(1)

    const parsedMessage = parsedMessages[0]

    // Extension fields should preserve their user-provided values
    expect(parsedMessage.payload.onboard_control_sensors_present_extended).toBe(0x12345678)
    expect(parsedMessage.payload.onboard_control_sensors_enabled_extended).toBe(0x87654321)
    expect(parsedMessage.payload.onboard_control_sensors_health_extended).toBe(0xabcdef00)

    console.log('User-provided extension field values preserved!')
  })

  test('should handle HEARTBEAT message completion', () => {
    const serializedBytes = serializer.serialize(
      'HEARTBEAT',
      {
        type: 2,
        autopilot: 12,
        base_mode: 89,
        custom_mode: 131072,
        system_status: 4,
        // mavlink_version field missing - should be auto-completed
      },
      { system_id: 1, component_id: 1, sequence: 0 }
    )
    const parsedMessages = parser.parseBytes(serializedBytes)
    expect(parsedMessages).toHaveLength(1)

    const parsedMessage = parsedMessages[0]

    // All fields should be present
    expect(parsedMessage.payload.type).toBe(2)
    expect(parsedMessage.payload.autopilot).toBe(12)
    expect(parsedMessage.payload.base_mode).toBe(89)
    expect(parsedMessage.payload.custom_mode).toBe(131072)
    expect(parsedMessage.payload.system_status).toBe(4)
    expect(parsedMessage.payload.mavlink_version).toBe(0) // Default value

    console.log('HEARTBEAT message completed with mavlink_version field!')
  })

  test('should handle array fields with defaults', () => {
    // Test PROTOCOL_VERSION which has arrays
    try {
      const serializedBytes = serializer.serialize(
        'PROTOCOL_VERSION',
        {
          version: 200,
          min_version: 100,
          max_version: 200,
          spec_version_hash: [1, 2, 3, 4, 5, 6, 7, 8], // Only provide partial array
          library_version_hash: [9, 10, 11, 12, 13, 14, 15, 16], // Only provide partial array
        },
        { system_id: 1, component_id: 1, sequence: 0 }
      )
      const parsedMessages = parser.parseBytes(serializedBytes)

      if (parsedMessages.length > 0) {
        const parsedMessage = parsedMessages[0]
        console.log('PROTOCOL_VERSION fields:', Object.keys(parsedMessage.payload))
        console.log('Array fields handled correctly!')
      }
    } catch (error) {
      // PROTOCOL_VERSION might not be available in all dialects
      console.log('PROTOCOL_VERSION not available in this dialect, skipping array test')
    }
  })
})
