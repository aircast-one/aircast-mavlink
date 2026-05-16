import { CommonParser, CommonSerializer } from '../../src/generated/dialects/common/full'

describe('Payload Structure Support', () => {
  let parser: CommonParser
  let serializer: CommonSerializer

  beforeEach(() => {
    parser = new CommonParser()
    serializer = new CommonSerializer()
  })

  test('should support serializing payload and parsing back', () => {
    console.log('Input message with payload structure')

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
        // Extension fields omitted - should be auto-completed
      },
      { system_id: 1, component_id: 1, sequence: 5 }
    )
    console.log('Serialized bytes length:', serializedBytes.length)

    // Parse it back
    const parsedMessages = parser.parseBytes(serializedBytes)
    expect(parsedMessages).toHaveLength(1)

    const parsedMessage = parsedMessages[0]
    console.log('Parsed message payload:', parsedMessage.payload)

    // Verify all fields are present including extension fields
    expect(parsedMessage.payload.onboard_control_sensors_present).toBe(31)
    expect(parsedMessage.payload.onboard_control_sensors_enabled).toBe(15)
    expect(parsedMessage.payload.onboard_control_sensors_health).toBe(7)
    expect(parsedMessage.payload.load).toBe(500)
    expect(parsedMessage.payload.voltage_battery).toBe(11800)
    expect(parsedMessage.payload.current_battery).toBe(1500)
    expect(parsedMessage.payload.battery_remaining).toBe(85)

    // Extension fields should be present with default values
    expect(parsedMessage.payload.onboard_control_sensors_present_extended).toBe(0)
    expect(parsedMessage.payload.onboard_control_sensors_enabled_extended).toBe(0)
    expect(parsedMessage.payload.onboard_control_sensors_health_extended).toBe(0)

    console.log('Payload structure works correctly!')
  })

  test('should handle round-trip usage - parsed message as input', () => {
    // Serialize and parse to get full structure
    const bytes1 = serializer.serialize(
      'HEARTBEAT',
      {
        type: 6,
        autopilot: 8,
        base_mode: 81,
        custom_mode: 12345,
        system_status: 4,
        // mavlink_version missing - should be auto-completed
      },
      { system_id: 1, component_id: 1, sequence: 42 }
    )
    const parsed = parser.parseBytes(bytes1)[0]

    console.log('Using parsed message payload as input:', parsed.payload)

    // Should serialize and parse identically
    const bytes2 = serializer.serialize(parsed.message_name, parsed.payload, {
      system_id: parsed.system_id,
      component_id: parsed.component_id,
      sequence: parsed.sequence,
    })
    const parsed2 = parser.parseBytes(bytes2)[0]

    expect(parsed2.payload.type).toBe(parsed.payload.type)
    expect(parsed2.payload.autopilot).toBe(parsed.payload.autopilot)
    expect(parsed2.payload.base_mode).toBe(parsed.payload.base_mode)
    expect(parsed2.payload.custom_mode).toBe(parsed.payload.custom_mode)
    expect(parsed2.payload.system_status).toBe(parsed.payload.system_status)
    expect(parsed2.payload.mavlink_version).toBe(parsed.payload.mavlink_version)

    console.log('Round-trip conversion works perfectly!')
  })
})
