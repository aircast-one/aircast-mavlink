import { CommonParser, CommonSerializer } from '../../src/generated/dialects/common/full'

describe('Payload Structure Support', () => {
  let parser: CommonParser
  let serializer: CommonSerializer

  beforeEach(() => {
    parser = new CommonParser()
    serializer = new CommonSerializer()
  })

  test('should support new payload structure (like parsed messages)', () => {
    // New payload structure - similar to parsed message format
    const messageWithPayload = {
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
        drop_rate_comm: 12,
        errors_comm: 5,
        errors_count1: 0,
        errors_count2: 0,
        errors_count3: 0,
        errors_count4: 0,
        // Extension fields omitted - should be auto-completed
      },
    }

    console.log('Input message with payload structure:', messageWithPayload)

    // Serialize the message
    const serializedBytes = serializer.serialize(messageWithPayload)
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

    console.log('✅ New payload structure works correctly!')
  })

  test('should reject flat structure (no backward compatibility)', () => {
    // Old flat structure should now be rejected
    const messageFlat = {
      message_name: 'HEARTBEAT',
      system_id: 1,
      component_id: 1,
      sequence: 42,
      type: 6,
      autopilot: 8,
      base_mode: 81,
      custom_mode: 12345,
      system_status: 4,
      mavlink_version: 3,
    }

    console.log('Input message with flat structure (should be rejected):', messageFlat)

    // Should throw error for flat structure
    expect(() => {
      serializer.serialize(messageFlat)
    }).toThrow("Message must have a 'payload' object containing the message fields")

    console.log('✅ Flat structure correctly rejected!')
  })

  test('should complete message with payload structure using completeMessage', () => {
    const incompleteMessage = {
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
        drop_rate_comm: 12,
        errors_comm: 5,
        errors_count1: 0,
        errors_count2: 0,
        errors_count3: 0,
        errors_count4: 0,
        // Extension fields missing
      },
    }

    const completedMessage = serializer.completeMessage(incompleteMessage)

    console.log('Completed message structure:', completedMessage)

    // Should have the same header fields
    expect(completedMessage.message_name).toBe('SYS_STATUS')
    expect(completedMessage.system_id).toBe(1)
    expect(completedMessage.component_id).toBe(1)
    expect(completedMessage.sequence).toBe(5)

    // Should have payload with all fields including extensions
    expect(completedMessage.payload).toBeDefined()
    const payload = completedMessage.payload as Record<string, unknown>

    expect(payload.onboard_control_sensors_present).toBe(31)
    expect(payload.load).toBe(500)
    expect(payload.voltage_battery).toBe(11800)

    // Extension fields should be added with defaults
    expect(payload.onboard_control_sensors_present_extended).toBe(0)
    expect(payload.onboard_control_sensors_enabled_extended).toBe(0)
    expect(payload.onboard_control_sensors_health_extended).toBe(0)

    console.log('✅ completeMessage works with payload structure!')
  })

  test('should handle round-trip usage - parsed message as input', () => {
    // Start with a payload message
    const originalPayload = {
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
        // mavlink_version missing - should be auto-completed
      },
    }

    // Serialize and parse to get full structure
    const bytes1 = serializer.serialize(originalPayload)
    const parsed = parser.parseBytes(bytes1)[0]

    // Now use the parsed message structure as input (with payload)
    const messageWithPayload = {
      message_name: parsed.message_name,
      system_id: parsed.system_id,
      component_id: parsed.component_id,
      sequence: parsed.sequence,
      payload: parsed.payload,
    }

    console.log('Using parsed message as input:', messageWithPayload)

    // Should serialize and parse identically
    const bytes2 = serializer.serialize(messageWithPayload)
    const parsed2 = parser.parseBytes(bytes2)[0]

    expect(parsed2.payload.type).toBe(parsed.payload.type)
    expect(parsed2.payload.autopilot).toBe(parsed.payload.autopilot)
    expect(parsed2.payload.base_mode).toBe(parsed.payload.base_mode)
    expect(parsed2.payload.custom_mode).toBe(parsed.payload.custom_mode)
    expect(parsed2.payload.system_status).toBe(parsed.payload.system_status)
    expect(parsed2.payload.mavlink_version).toBe(parsed.payload.mavlink_version)

    console.log('✅ Round-trip conversion works perfectly!')
  })

  test('should handle missing payload object with clear error', () => {
    const messageWithoutPayload = {
      message_name: 'HEARTBEAT',
      system_id: 1,
      component_id: 1,
      sequence: 42,
      // No payload object
    }

    expect(() => {
      serializer.serialize(messageWithoutPayload)
    }).toThrow("Message must have a 'payload' object containing the message fields")

    console.log('✅ Missing payload error handled correctly!')
  })

  test('should handle invalid payload type with clear error', () => {
    const messageWithInvalidPayload = {
      message_name: 'HEARTBEAT',
      system_id: 1,
      component_id: 1,
      sequence: 42,
      payload: 'invalid payload type', // String instead of object
    }

    expect(() => {
      serializer.serialize(messageWithInvalidPayload)
    }).toThrow("Message must have a 'payload' object containing the message fields")

    console.log('✅ Invalid payload type error handled correctly!')
  })
})
