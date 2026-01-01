#!/usr/bin/env tsx

import { CommonSerializer } from '../../src/generated/dialects/common/full'

// Test REQUEST_DATA_STREAM with different message rates to see if any produces the expected checksum
const serializer = new CommonSerializer()

const testCases = [
  { req_message_rate: 1, description: 'Rate 1 (current)' },
  { req_message_rate: 2, description: 'Rate 2' },
  { req_message_rate: 3, description: 'Rate 3' },
  { req_message_rate: 4, description: 'Rate 4' },
  { req_message_rate: 5, description: 'Rate 5' },
  { req_message_rate: 10, description: 'Rate 10' },
  { req_message_rate: 0, description: 'Rate 0' },
]

for (const testCase of testCases) {
  const message = {
    message_name: 'REQUEST_DATA_STREAM',
    system_id: 255,
    component_id: 190,
    sequence: 0,
    payload: {
      target_system: 1,
      target_component: 1,
      req_stream_id: 0,
      req_message_rate: testCase.req_message_rate,
      start_stop: 1,
    },
  }

  try {
    console.log(`\n=== ${testCase.description} ===`)
    const serialized = serializer.serialize(message)

    // Extract checksum from the serialized frame
    if (serialized.length >= 2) {
      const checksumLow = serialized[serialized.length - 2]
      const checksumHigh = serialized[serialized.length - 1]
      const checksum = checksumLow | (checksumHigh << 8)

      const payloadStart = 6
      const payloadLength = serialized[1]
      const payload = serialized.slice(payloadStart, payloadStart + payloadLength)

      console.log(
        `Payload: ${Array.from(payload)
          .map((b: number) => '0x' + b.toString(16).padStart(2, '0'))
          .join(' ')}`
      )
      console.log(`Checksum: 0x${checksum.toString(16).padStart(4, '0')}`)

      if (checksum === 0x003c) {
        console.log('🎉 MATCH! This is the correct rate!')
        break
      }
    }
  } catch (error) {
    console.error('Error:', error)
  }
}
