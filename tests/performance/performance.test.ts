import { CommonParser, CommonSerializer } from '../../src/generated/dialects/common/full'
import { MinimalParser, MinimalSerializer } from '../../src/generated/dialects/minimal/full'

describe('Performance and Stress Tests', () => {
  let parser: CommonParser
  let serializer: CommonSerializer
  let minimalParser: MinimalParser
  let minimalSerializer: MinimalSerializer

  beforeEach(() => {
    parser = new CommonParser()
    serializer = new CommonSerializer()
    minimalParser = new MinimalParser()
    minimalSerializer = new MinimalSerializer()
  })

  describe('Serialization Performance', () => {
    test('should serialize HEARTBEAT messages at high throughput', () => {
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

      const iterations = 10000
      const startTime = performance.now()

      for (let i = 0; i < iterations; i++) {
        message.sequence = i % 256
        serializer.serialize(message)
      }

      const endTime = performance.now()
      const duration = endTime - startTime
      const throughput = iterations / (duration / 1000)

      console.log(`HEARTBEAT serialization: ${iterations} messages in ${duration.toFixed(2)}ms`)
      console.log(`Throughput: ${throughput.toFixed(0)} messages/second`)

      // Should serialize at least 1000 messages per second
      expect(throughput).toBeGreaterThan(1000)
    })

    test('should serialize complex SYS_STATUS messages efficiently', () => {
      const message = {
        message_name: 'SYS_STATUS',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        payload: {
          onboard_control_sensors_present: 0x7fffffff,
          onboard_control_sensors_enabled: 0x3fffffff,
          onboard_control_sensors_health: 0x1fffffff,
          load: 850,
          voltage_battery: 14800,
          current_battery: 2500,
          battery_remaining: 75,
          drop_rate_comm: 0,
          errors_comm: 0,
          errors_count1: 0,
          errors_count2: 0,
          errors_count3: 0,
          errors_count4: 0,
        },
      }

      const iterations = 5000
      const startTime = performance.now()

      for (let i = 0; i < iterations; i++) {
        message.sequence = i % 256
        message.payload.load = i % 1000
        serializer.serialize(message)
      }

      const endTime = performance.now()
      const duration = endTime - startTime
      const throughput = iterations / (duration / 1000)

      console.log(`SYS_STATUS serialization: ${iterations} messages in ${duration.toFixed(2)}ms`)
      console.log(`Throughput: ${throughput.toFixed(0)} messages/second`)

      // Should serialize at least 500 messages per second
      expect(throughput).toBeGreaterThan(500)
    })
  })

  describe('Parsing Performance', () => {
    test('should parse HEARTBEAT messages at high throughput', () => {
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

      // Pre-serialize messages for parsing
      const serializedMessages: Uint8Array[] = []
      for (let i = 0; i < 1000; i++) {
        message.sequence = i % 256
        serializedMessages.push(serializer.serialize(message))
      }

      const iterations = 10000
      const startTime = performance.now()

      for (let i = 0; i < iterations; i++) {
        const bytes = serializedMessages[i % serializedMessages.length]
        parser.parseBytes(bytes)
      }

      const endTime = performance.now()
      const duration = endTime - startTime
      const throughput = iterations / (duration / 1000)

      console.log(`HEARTBEAT parsing: ${iterations} messages in ${duration.toFixed(2)}ms`)
      console.log(`Throughput: ${throughput.toFixed(0)} messages/second`)

      // Should parse at least 1000 messages per second
      expect(throughput).toBeGreaterThan(1000)
    })

    test('should handle large message buffers efficiently', () => {
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

      // Create a large buffer with multiple concatenated messages
      const messageCount = 1000
      const allBytes: number[] = []

      for (let i = 0; i < messageCount; i++) {
        message.sequence = i % 256
        const bytes = serializer.serialize(message)
        allBytes.push(...Array.from(bytes))
      }

      const largeBuffer = new Uint8Array(allBytes)

      const startTime = performance.now()
      const parsed = parser.parseBytes(largeBuffer)
      const endTime = performance.now()

      const duration = endTime - startTime
      const throughput = messageCount / (duration / 1000)

      console.log(`Large buffer parsing: ${messageCount} messages in ${duration.toFixed(2)}ms`)
      console.log(`Throughput: ${throughput.toFixed(0)} messages/second`)

      expect(parsed).toHaveLength(messageCount)
      expect(throughput).toBeGreaterThan(5000) // Should be faster with batch processing
    })
  })

  describe('Memory Stress Tests', () => {
    test('should handle rapid serialization without memory leaks', () => {
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

      const iterations = 50000

      // Force garbage collection if available
      if (typeof global.gc === 'function') {
        global.gc()
      }

      const startMemory = process.memoryUsage()

      for (let i = 0; i < iterations; i++) {
        message.sequence = i % 256
        serializer.serialize(message)

        // Occasional cleanup
        if (i % 10000 === 0 && typeof global.gc === 'function') {
          global.gc()
        }
      }

      const endMemory = process.memoryUsage()
      const memoryGrowth = endMemory.heapUsed - startMemory.heapUsed
      const memoryGrowthMB = memoryGrowth / (1024 * 1024)

      console.log(
        `Memory growth after ${iterations} serializations: ${memoryGrowthMB.toFixed(2)}MB`
      )

      // Memory growth should be reasonable (less than 10MB for 50k operations)
      expect(memoryGrowthMB).toBeLessThan(10)
    })

    test('should handle rapid parsing without memory leaks', () => {
      const message = {
        message_name: 'SYS_STATUS',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        payload: {
          onboard_control_sensors_present: 0x1fffffff,
          onboard_control_sensors_enabled: 0x0fffffff,
          onboard_control_sensors_health: 0x07ffffff,
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
      }

      // Pre-serialize for parsing
      const serializedMessage = serializer.serialize(message)
      const iterations = 50000

      if (typeof global.gc === 'function') {
        global.gc()
      }

      const startMemory = process.memoryUsage()

      for (let i = 0; i < iterations; i++) {
        parser.parseBytes(serializedMessage)

        // Reset parser buffer periodically to avoid accumulation
        if (i % 1000 === 0) {
          parser.resetBuffer()
          if (typeof global.gc === 'function') {
            global.gc()
          }
        }
      }

      const endMemory = process.memoryUsage()
      const memoryGrowth = endMemory.heapUsed - startMemory.heapUsed
      const memoryGrowthMB = memoryGrowth / (1024 * 1024)

      console.log(`Memory growth after ${iterations} parsings: ${memoryGrowthMB.toFixed(2)}MB`)

      // Memory growth should be reasonable
      expect(memoryGrowthMB).toBeLessThan(15)
    })
  })

  describe('Edge Case Stress Tests', () => {
    test('should handle maximum field values without overflow', () => {
      const maxValueMessage = {
        message_name: 'HEARTBEAT',
        system_id: 255,
        component_id: 255,
        sequence: 255,
        payload: {
          type: 255,
          autopilot: 255,
          base_mode: 255,
          custom_mode: 0xffffffff, // Max uint32
          system_status: 255,
          mavlink_version: 255,
        },
      }

      const iterations = 1000

      for (let i = 0; i < iterations; i++) {
        const bytes = serializer.serialize(maxValueMessage)
        const parsed = parser.parseBytes(bytes)

        expect(parsed).toHaveLength(1)
        expect(parsed[0].payload.type).toBe(255)
        expect(parsed[0].payload.custom_mode).toBe(0xffffffff)
      }
    })

    test('should handle rapid buffer operations', () => {
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

      const serializedMessage = serializer.serialize(message)
      const iterations = 10000

      for (let i = 0; i < iterations; i++) {
        // Parse with fresh parser each time
        const freshParser = new CommonParser()
        const parsed = freshParser.parseBytes(serializedMessage)
        expect(parsed).toHaveLength(1)

        // Reset and reuse original parser
        parser.resetBuffer()
        const parsed2 = parser.parseBytes(serializedMessage)
        expect(parsed2).toHaveLength(1)
      }
    })

    test('should handle concurrent serialization with different dialects', () => {
      const heartbeatMessage = {
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

      const iterations = 1000

      for (let i = 0; i < iterations; i++) {
        // Serialize same message with both dialects
        const commonBytes = serializer.serialize(heartbeatMessage)
        const minimalBytes = minimalSerializer.serialize(heartbeatMessage)

        // Both should produce identical bytes
        expect(Array.from(commonBytes)).toEqual(Array.from(minimalBytes))

        // Both should parse correctly
        const commonParsed = parser.parseBytes(commonBytes)
        const minimalParsed = minimalParser.parseBytes(minimalBytes)

        expect(commonParsed).toHaveLength(1)
        expect(minimalParsed).toHaveLength(1)
        expect(commonParsed[0].payload).toEqual(minimalParsed[0].payload)
      }
    })
  })

  describe('Message Completion Performance', () => {
    test('should complete messages efficiently', () => {
      const incompleteMessage = {
        message_name: 'SYS_STATUS',
        system_id: 1,
        component_id: 1,
        sequence: 0,
        payload: {
          onboard_control_sensors_present: 0x1f,
          onboard_control_sensors_enabled: 0x0f,
          onboard_control_sensors_health: 0x07,
          load: 500,
          // Missing many fields - should be auto-completed
        },
      }

      const iterations = 5000
      const startTime = performance.now()

      for (let i = 0; i < iterations; i++) {
        incompleteMessage.sequence = i % 256
        const completed = serializer.completeMessage(incompleteMessage)

        // Verify completion worked
        expect(completed.payload).toBeDefined()
        expect((completed.payload as any).voltage_battery).toBeDefined()
        expect((completed.payload as any).current_battery).toBeDefined()
      }

      const endTime = performance.now()
      const duration = endTime - startTime
      const throughput = iterations / (duration / 1000)

      console.log(`Message completion: ${iterations} messages in ${duration.toFixed(2)}ms`)
      console.log(`Throughput: ${throughput.toFixed(0)} completions/second`)

      // Should complete at least 1000 messages per second
      expect(throughput).toBeGreaterThan(1000)
    })
  })
})
