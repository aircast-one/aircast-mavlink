#!/usr/bin/env tsx

import { CommonSerializer } from '../../src/generated/dialects/common/full'

// Test the exact parameters from the PCAP analysis that should produce 0x003c
const testCases = [
  {
    description: 'QGroundControl PCAP match attempt',
    message: {
      message_name: 'REQUEST_DATA_STREAM',
      system_id: 1, // Changed from 255 to match PCAP
      component_id: 1, // Changed from 190 to match PCAP
      sequence: 0,
      payload: {
        target_system: 0, // Changed from 1 to match PCAP
        target_component: 2, // Changed from 1 to match PCAP
        req_stream_id: 178, // Changed from 0 to match PCAP (0xb2)
        req_message_rate: 1,
        start_stop: 1,
      },
    },
  },
  {
    description: 'Original test case',
    message: {
      message_name: 'REQUEST_DATA_STREAM',
      system_id: 255,
      component_id: 190,
      sequence: 0,
      payload: {
        target_system: 1,
        target_component: 1,
        req_stream_id: 0,
        req_message_rate: 1,
        start_stop: 1,
      },
    },
  },
]

const serializer = new CommonSerializer()

for (const testCase of testCases) {
  try {
    console.log(`\n=== ${testCase.description} ===`)
    console.log('Message:', JSON.stringify(testCase.message, null, 2))

    const serialized = serializer.serialize(testCase.message)
    console.log(
      'Serialized bytes:',
      Array.from(serialized)
        .map((b: number) => '0x' + b.toString(16).padStart(2, '0'))
        .join(' ')
    )

    // Extract checksum from the serialized frame
    if (serialized.length >= 2) {
      const checksumLow = serialized[serialized.length - 2]
      const checksumHigh = serialized[serialized.length - 1]
      const checksum = checksumLow | (checksumHigh << 8)

      console.log(`Checksum: 0x${checksum.toString(16).padStart(4, '0')}`)
      console.log(`Expected (SITL): 0x003c`)
      console.log(`Match: ${checksum === 0x003c ? '✅ Yes!' : '❌ No'}`)

      if (checksum === 0x003c) {
        console.log('🎉 SUCCESS! Found the correct parameters!')
        break
      }
    }
  } catch (error) {
    console.error('Error:', error)
  }
}
