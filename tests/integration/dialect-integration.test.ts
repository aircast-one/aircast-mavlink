/**
 * Consolidated integration tests for MAVLink dialects
 * Tests message parsing, serialization, and cross-dialect compatibility
 */

import {
  CommonDialectTestBase,
  MinimalDialectTestBase,
  CrossDialectTestHelper,
} from '../helpers/test-base'
import { testMessages, messageSequences } from '../fixtures/messages'

describe('MAVLink Dialect Integration Tests', () => {
  describe('Common Dialect Integration', () => {
    const testBase = new CommonDialectTestBase()

    beforeEach(() => {
      testBase.beforeEach()
    })

    afterEach(() => {
      testBase.afterEach()
    })

    describe('Single Message Round-trip Tests', () => {
      test('HEARTBEAT message round-trip', () => {
        const message = testMessages.heartbeat()
        const result = testBase.roundTripTest(message)

        expect(result.parsedMessage.message_name).toBe('HEARTBEAT')
        expect(result.parsedMessage.system_id).toBe(message.system_id)
        expect(result.parsedMessage.crc_ok).toBe(true)
      })

      test('SYS_STATUS message round-trip', () => {
        const message = testMessages.sysStatus()
        const result = testBase.roundTripTest(message)

        expect(result.parsedMessage.message_name).toBe('SYS_STATUS')
        expect(result.parsedMessage.system_id).toBe(message.system_id)
        expect(result.parsedMessage.crc_ok).toBe(true)
        expect(result.parsedMessage.payload.load).toBeGreaterThanOrEqual(0)
        expect(result.parsedMessage.payload.voltage_battery).toBeGreaterThanOrEqual(0)
      })

      test('GPS_RAW_INT message round-trip', () => {
        const message = testMessages.gpsRawInt()
        const result = testBase.roundTripTest(message)

        expect(result.parsedMessage.message_name).toBe('GPS_RAW_INT')
        expect(result.parsedMessage.system_id).toBe(message.system_id)
        expect(result.parsedMessage.crc_ok).toBe(true)
      })

      test('STATUSTEXT message round-trip', () => {
        const message = testMessages.statusText()
        const result = testBase.roundTripTest(message)

        expect(result.parsedMessage).toBeDefined()
        expect(result.parsedMessage).toBeDefined()
      })

      test('GLOBAL_POSITION_INT message round-trip', () => {
        const message = testMessages.globalPositionInt()
        const result = testBase.roundTripTest(message)

        expect(result.parsedMessage).toBeDefined()
        expect(result.parsedMessage).toBeDefined()
      })

      test('ATTITUDE message round-trip', () => {
        const message = testMessages.attitude()
        const result = testBase.roundTripTest(message)

        expect(result.parsedMessage).toBeDefined()
        expect(result.parsedMessage).toBeDefined()
      })

      test('RC_CHANNELS message round-trip', () => {
        const message = testMessages.rcChannels()
        const result = testBase.roundTripTest(message)

        expect(result.parsedMessage).toBeDefined()
        expect(result.parsedMessage).toBeDefined()
        expect(result.parsedMessage.payload.chancount).toBeGreaterThanOrEqual(0)
      })
    })

    describe('Multi-message Tests', () => {
      test('system startup sequence', () => {
        const messages = messageSequences.systemStartup()
        const parsedMessages = testBase.multiMessageTest(messages)

        expect(parsedMessages).toHaveLength(3)
        expect(parsedMessages[0].message_name).toBe('HEARTBEAT')
        expect(parsedMessages[1].message_name).toBe('SYS_STATUS')
        expect(parsedMessages[2].message_name).toBe('STATUSTEXT')

        // Verify sequence numbers are preserved
        parsedMessages.forEach((msg, index) => {
          expect(msg.sequence).toBe(index)
        })
      })

      test('navigation data sequence', () => {
        const messages = messageSequences.navigationData()
        const parsedMessages = testBase.multiMessageTest(messages)

        expect(parsedMessages).toHaveLength(3)
        expect(parsedMessages[0].message_name).toBe('GPS_RAW_INT')
        expect(parsedMessages[1].message_name).toBe('ATTITUDE')
        expect(parsedMessages[2].message_name).toBe('GLOBAL_POSITION_INT')
      })
    })

    describe('Error Handling', () => {
      test('invalid message structure', () => {
        const invalidMessage = { invalid: 'structure' }
        testBase.errorHandlingTest(invalidMessage, 'Unknown message type')
      })

      test('missing payload defaults to empty object', () => {
        const messageWithoutPayload = {
          message_name: 'HEARTBEAT',
          system_id: 1,
          component_id: 1,
          sequence: 0,
        }
        // With the new API, missing payload defaults to {} and all fields get default values
        const result = testBase.roundTripTest({ ...messageWithoutPayload, payload: {} })
        expect(result.parsedMessage.message_name).toBe('HEARTBEAT')
        expect(result.parsedMessage.payload.type).toBe(0)
      })

      test('corrupted data handling', () => {
        const validMessage = testMessages.heartbeat()
        testBase.corruptedDataTest(validMessage)
      })
    })
  })

  describe('Minimal Dialect Integration', () => {
    const testBase = new MinimalDialectTestBase()

    beforeEach(() => {
      testBase.beforeEach()
    })

    afterEach(() => {
      testBase.afterEach()
    })

    test('HEARTBEAT message round-trip', () => {
      const message = testMessages.heartbeat()
      const result = testBase.roundTripTest(message)

      expect(result.parsedMessage).toBeDefined()
      expect(result.parsedMessage).toBeDefined()
      expect(result.parsedMessage.dialect).toBe('minimal')
    })

    test('should handle messages not in minimal dialect', () => {
      // GPS_RAW_INT is not in minimal dialect
      const message = testMessages.gpsRawInt()
      testBase.errorHandlingTest(message)
    })
  })

  describe('Cross-dialect Compatibility', () => {
    let commonTestBase: CommonDialectTestBase
    let minimalTestBase: MinimalDialectTestBase

    beforeEach(() => {
      commonTestBase = new CommonDialectTestBase()
      minimalTestBase = new MinimalDialectTestBase()
      commonTestBase.beforeEach()
      minimalTestBase.beforeEach()
    })

    afterEach(() => {
      commonTestBase.afterEach()
      minimalTestBase.afterEach()
    })

    test('HEARTBEAT compatibility between dialects', () => {
      const message = testMessages.heartbeat()

      // Test cross-dialect compatibility
      const result = CrossDialectTestHelper.crossDialectCompatibilityTest(
        (commonTestBase as any).parser,
        (commonTestBase as any).serializer,
        (minimalTestBase as any).parser,
        message
      )

      expect(result.sourceParsed).toBeDefined()
      expect(result.sourceParsed.dialect).toBe('common')
      expect(result.targetParsed.dialect).toBe('minimal')
    })
  })

  describe('Message Variations and Edge Cases', () => {
    const testBase = new CommonDialectTestBase()

    beforeEach(() => {
      testBase.beforeEach()
    })

    afterEach(() => {
      testBase.afterEach()
    })

    test('HEARTBEAT with different system/component IDs', () => {
      const variations = [
        { system_id: 0, component_id: 0 },
        { system_id: 255, component_id: 255 },
        { system_id: 42, component_id: 100 },
      ]

      variations.forEach((override) => {
        const message = testMessages.heartbeat(override)
        const result = testBase.roundTripTest(message)

        expect(result.parsedMessage.system_id).toBe(override.system_id)
        expect(result.parsedMessage.component_id).toBe(override.component_id)
      })
    })

    test('GPS coordinates with extreme values', () => {
      const extremeGps = testMessages.gpsRawInt({
        payload: {
          lat: 900000000, // 90 degrees north
          lon: 1800000000, // 180 degrees east
          alt: 50000, // 50km altitude
          satellites_visible: 255,
        },
      })

      const result = testBase.roundTripTest(extremeGps)
      expect(result.parsedMessage).toBeDefined()
    })

    test('STATUSTEXT with various text lengths', () => {
      const textVariations = [
        '',
        'Short',
        'A'.repeat(30),
        'A'.repeat(50), // Maximum length
      ]

      textVariations.forEach((text) => {
        const message = testMessages.statusText(text)
        const result = testBase.roundTripTest(message)

        expect(result.parsedMessage.payload.text).toBe(text)
      })
    })

    test('sequence number rollover', () => {
      const messages = []
      for (let i = 250; i <= 260; i++) {
        messages.push(testMessages.heartbeat({ sequence: i % 256 }))
      }

      const parsedMessages = testBase.multiMessageTest(messages)
      expect(parsedMessages).toHaveLength(11)

      // Verify sequence numbers including rollover
      parsedMessages.forEach((msg, index) => {
        const expectedSequence = (250 + index) % 256
        expect(msg.sequence).toBe(expectedSequence)
      })
    })
  })
})
