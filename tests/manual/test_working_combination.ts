#!/usr/bin/env tsx

import { CommonSerializer } from '../../src/generated/dialects/common/full'

// Test REQUEST_DATA_STREAM serialization with parameters that should produce checksum 0x003c
const serializer = new CommonSerializer()

console.log('Testing REQUEST_DATA_STREAM combinations that produce checksum 0x003c...\n')

const workingCombinations = [
  {
    name: 'Combination 1',
    message: {
      message_name: 'REQUEST_DATA_STREAM',
      system_id: 1,
      component_id: 1,
      sequence: 1,
      payload: {
        target_system: 0,
        target_component: 2,
        req_stream_id: 153,
        req_message_rate: 5,
        start_stop: 1,
      },
    },
    expected_bytes: 'fe 06 01 01 01 42 00 02 99 05 00 01 3c 00',
  },
  {
    name: 'Combination 2',
    message: {
      message_name: 'REQUEST_DATA_STREAM',
      system_id: 1,
      component_id: 1,
      sequence: 0,
      payload: {
        target_system: 0,
        target_component: 2,
        req_stream_id: 178,
        req_message_rate: 1,
        start_stop: 1,
      },
    },
    expected_bytes: 'fe 06 00 01 01 42 00 02 b2 01 00 01 3c 00',
  },
  {
    name: 'Combination 3',
    message: {
      message_name: 'REQUEST_DATA_STREAM',
      system_id: 1,
      component_id: 0,
      sequence: 0,
      payload: {
        target_system: 0,
        target_component: 6,
        req_stream_id: 165,
        req_message_rate: 10,
        start_stop: 0,
      },
    },
    expected_bytes: 'fe 06 00 01 00 42 00 06 a5 0a 00 00 3c 00',
  },
]

for (const combo of workingCombinations) {
  console.log(`=== ${combo.name} ===`)
  console.log('Message:', JSON.stringify(combo.message, null, 2))

  try {
    const serialized = serializer.serialize(combo.message)
    const actualBytes = Array.from(serialized)
      .map((b: number) => b.toString(16).padStart(2, '0'))
      .join(' ')

    console.log('Expected bytes:', combo.expected_bytes)
    console.log('Actual bytes:  ', actualBytes)
    console.log('Match:', actualBytes === combo.expected_bytes ? '✅ YES' : '❌ NO')

    // Extract checksum
    if (serialized.length >= 2) {
      const checksumLow = serialized[serialized.length - 2]
      const checksumHigh = serialized[serialized.length - 1]
      const checksum = checksumLow | (checksumHigh << 8)
      console.log(`Checksum: 0x${checksum.toString(16).padStart(4, '0')}`)
      console.log(`Expected: 0x003c`)
      console.log(`Checksum match: ${checksum === 0x003c ? '✅ YES' : '❌ NO'}`)

      if (checksum === 0x003c) {
        console.log('🎉 SUCCESS! This combination produces the expected checksum!')
      }
    }
  } catch (error) {
    console.error('Error:', error)
  }

  console.log()
}
