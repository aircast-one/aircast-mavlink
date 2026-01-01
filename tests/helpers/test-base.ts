/**
 * Base test classes and utilities for MAVLink testing
 */

export { testMessages } from '../fixtures/messages'

export interface MAVLinkParsedMessage {
  timestamp?: number
  system_id: number
  component_id: number
  message_id: number
  message_name: string
  sequence: number
  payload: Record<string, any>
  protocol_version: number
  checksum: number
  crc_ok: boolean
  signature?: any
  dialect: string
}

export interface RoundTripResult {
  original: any
  serializedBytes: Uint8Array
  parsedMessages: MAVLinkParsedMessage[]
  parsedMessage: MAVLinkParsedMessage
}

/**
 * Base class for MAVLink parser/serializer testing
 */
export abstract class MAVLinkTestBase {
  protected parser: any
  protected serializer: any

  /**
   * Perform a complete round-trip test: serialize -> parse -> validate
   */
  public roundTripTest(message: any): RoundTripResult {
    const serializedBytes = this.serializer.serialize(message)
    const parsedMessages = this.parser.parseBytes(serializedBytes)

    expect(serializedBytes).toBeInstanceOf(Uint8Array)
    expect(serializedBytes.length).toBeGreaterThan(0)
    expect(parsedMessages).toHaveLength(1)

    const parsedMessage = parsedMessages[0]

    // Validate basic message structure
    expect(parsedMessage.message_name).toBe(message.message_name)
    expect(parsedMessage.system_id).toBe(message.system_id)
    expect(parsedMessage.component_id).toBe(message.component_id)
    expect(parsedMessage.sequence).toBe(message.sequence)
    expect(parsedMessage.crc_ok).toBe(true)

    return {
      original: message,
      serializedBytes,
      parsedMessages,
      parsedMessage,
    }
  }

  /**
   * Test multiple messages in sequence
   */
  public multiMessageTest(messages: any[]): MAVLinkParsedMessage[] {
    const allBytes: number[] = []

    for (const message of messages) {
      const bytes = this.serializer.serialize(message)
      allBytes.push(...Array.from(bytes as Uint8Array))
    }

    const combinedBytes = new Uint8Array(allBytes)
    const parsedMessages = this.parser.parseBytes(combinedBytes)

    expect(parsedMessages).toHaveLength(messages.length)

    // Validate each message in sequence
    parsedMessages.forEach((parsed: any, index: number) => {
      expect(parsed.message_name).toBe(messages[index].message_name)
      expect(parsed.sequence).toBe(messages[index].sequence)
    })

    return parsedMessages
  }

  /**
   * Test error handling with invalid data
   */
  public errorHandlingTest(invalidMessage: any, expectedError?: string) {
    if (expectedError) {
      expect(() => {
        this.serializer.serialize(invalidMessage)
      }).toThrow(expectedError)
    } else {
      expect(() => {
        this.serializer.serialize(invalidMessage)
      }).toThrow()
    }
  }

  /**
   * Test corrupted data handling
   */
  public corruptedDataTest(validMessage: any) {
    const validBytes = this.serializer.serialize(validMessage)
    const corruptedBytes = new Uint8Array(validBytes)

    // Corrupt some bytes
    corruptedBytes[10] = 0xff
    corruptedBytes[11] = 0xff

    // Parser should handle corrupted data gracefully
    const parsedMessages = this.parser.parseBytes(corruptedBytes)
    expect(Array.isArray(parsedMessages)).toBe(true)
    // May be empty or contain messages with crc_ok: false
  }

  /**
   * Validate payload fields match expected values
   */
  public validatePayload(parsed: MAVLinkParsedMessage, expected: Record<string, any>) {
    Object.entries(expected).forEach(([key, value]) => {
      if (typeof value === 'bigint') {
        expect(parsed.payload[key]).toBe(value)
      } else if (typeof value === 'number' && !Number.isInteger(value)) {
        expect(parsed.payload[key]).toBeCloseTo(value, 4)
      } else {
        expect(parsed.payload[key]).toBe(value)
      }
    })
  }
}

/**
 * Common dialect test base
 */
export class CommonDialectTestBase extends MAVLinkTestBase {
  protected parser: any
  protected serializer: any

  beforeEach() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { CommonParser, CommonSerializer } = require('../../src/generated/dialects/common/full')
    this.parser = new CommonParser()
    this.serializer = new CommonSerializer()
  }

  afterEach() {
    // Clean up if needed
  }
}

/**
 * Minimal dialect test base
 */
export class MinimalDialectTestBase extends MAVLinkTestBase {
  protected parser: any
  protected serializer: any

  beforeEach() {
    /* eslint-disable @typescript-eslint/no-var-requires */
    const {
      MinimalParser,
      MinimalSerializer,
    } = require('../../src/generated/dialects/minimal/full')
    /* eslint-enable @typescript-eslint/no-var-requires */
    this.parser = new MinimalParser()
    this.serializer = new MinimalSerializer()
  }

  afterEach() {
    // Clean up if needed
  }
}

/**
 * ArduPilot Mega dialect test base
 */
export class ArdupilotmegaDialectTestBase extends MAVLinkTestBase {
  protected parser: any
  protected serializer: any

  beforeEach() {
    /* eslint-disable @typescript-eslint/no-var-requires */
    const {
      ArdupilotmegaParser,
      ArdupilotmegaSerializer,
    } = require('../../src/generated/dialects/ardupilotmega/full')
    /* eslint-enable @typescript-eslint/no-var-requires */
    this.parser = new ArdupilotmegaParser()
    this.serializer = new ArdupilotmegaSerializer()
  }

  afterEach() {
    // Clean up if needed
  }
}

/**
 * Cross-dialect testing utilities
 */
export class CrossDialectTestHelper {
  /**
   * Test that a message serialized by one dialect can be parsed by another
   */
  static crossDialectCompatibilityTest(
    sourceParser: any,
    sourceSerializer: any,
    targetParser: any,
    message: any
  ) {
    // Serialize with source dialect
    const serializedBytes = sourceSerializer.serialize(message)

    // Parse with both dialects
    const sourceParsed = sourceParser.parseBytes(serializedBytes)
    const targetParsed = targetParser.parseBytes(serializedBytes)

    // Both should parse successfully
    expect(sourceParsed).toHaveLength(1)
    expect(targetParsed).toHaveLength(1)

    // Core message data should be identical
    expect(sourceParsed[0].message_name).toBe(targetParsed[0].message_name)
    expect(sourceParsed[0].system_id).toBe(targetParsed[0].system_id)
    expect(sourceParsed[0].component_id).toBe(targetParsed[0].component_id)

    return { sourceParsed: sourceParsed[0], targetParsed: targetParsed[0] }
  }
}

/**
 * Performance testing utilities
 */
export class PerformanceTestHelper {
  /**
   * Test parsing performance with large datasets
   */
  static performanceTest(parser: any, serializer: any, message: any, iterations = 1000) {
    const messages: number[] = []

    // Generate large dataset
    for (let i = 0; i < iterations; i++) {
      const testMessage = { ...message, sequence: i }
      const bytes = serializer.serialize(testMessage)
      messages.push(...Array.from(bytes as Uint8Array))
    }

    const largeBuffer = new Uint8Array(messages)

    // Measure parsing time
    const startTime = Date.now()
    const parsedMessages = parser.parseBytes(largeBuffer)
    const endTime = Date.now()

    expect(parsedMessages).toHaveLength(iterations)

    const parseTime = endTime - startTime
    const messagesPerSecond = (iterations / parseTime) * 1000

    return {
      parseTime,
      messagesPerSecond,
      totalMessages: iterations,
      parsedCount: parsedMessages.length,
    }
  }
}
