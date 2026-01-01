#!/usr/bin/env tsx

import { CommonSerializer } from '../../src/generated/dialects/common/full'

const serializer = new CommonSerializer()

// Test different field combinations to understand the ordering
const testCases = [
  {
    description: 'Current aircast parameters',
    payload: {
      target_system: 1,
      target_component: 1,
      req_stream_id: 0,
      req_message_rate: 1,
      start_stop: 1,
    },
  },
  {
    description: 'Try gomavlib-style parameters',
    payload: {
      target_system: 1,
      target_component: 0, // Changed from 1 to 0
      req_stream_id: 1, // Changed from 0 to 1
      req_message_rate: 1,
      start_stop: 1,
    },
  },
  {
    description: 'Minimal test case',
    payload: {
      target_system: 0,
      target_component: 0,
      req_stream_id: 0,
      req_message_rate: 0,
      start_stop: 0,
    },
  },
]

for (const testCase of testCases) {
  console.log(`\n=== ${testCase.description} ===`)

  const message = {
    message_name: 'REQUEST_DATA_STREAM',
    system_id: 255,
    component_id: 190,
    sequence: 0, // Start from 0 like gomavlib
    payload: testCase.payload,
  }

  try {
    const serialized = serializer.serialize(message)

    console.log(
      'Full frame:',
      Array.from(serialized)
        .map((b: number) => '0x' + b.toString(16).padStart(2, '0'))
        .join(' ')
    )

    // Extract payload (6 bytes after header)
    const payloadBytes = serialized.slice(6, 6 + 6)
    console.log(
      'Payload only:',
      Array.from(payloadBytes)
        .map((b: number) => '0x' + b.toString(16).padStart(2, '0'))
        .join(' ')
    )

    // Show field by field
    console.log('Field breakdown:')
    console.log(
      `  target_system: ${payloadBytes[0]} (0x${payloadBytes[0].toString(16).padStart(2, '0')})`
    )
    console.log(
      `  target_component: ${payloadBytes[1]} (0x${payloadBytes[1].toString(16).padStart(2, '0')})`
    )
    console.log(
      `  req_stream_id: ${payloadBytes[2]} (0x${payloadBytes[2].toString(16).padStart(2, '0')})`
    )
    console.log(
      `  req_message_rate: ${payloadBytes[3] | (payloadBytes[4] << 8)} (0x${payloadBytes[3].toString(16).padStart(2, '0')} 0x${payloadBytes[4].toString(16).padStart(2, '0')})`
    )
    console.log(
      `  start_stop: ${payloadBytes[5]} (0x${payloadBytes[5].toString(16).padStart(2, '0')})`
    )

    // Extract checksum
    const checksum = serialized[serialized.length - 2] | (serialized[serialized.length - 1] << 8)
    console.log(`Checksum: 0x${checksum.toString(16).padStart(4, '0')}`)
  } catch (error) {
    console.error('Error:', error)
  }
}

console.log('\n=== Gomavlib reference (from previous test) ===')
console.log('Full frame: 0xfe 0x06 0x00 0xff 0xbe 0x42 0x01 0x00 0x01 0x01 0x00 0x01 0x34 0x82')
console.log('Payload only: 0x01 0x00 0x01 0x01 0x00 0x01')
console.log('Field breakdown:')
console.log('  target_system: 1 (0x01)')
console.log('  target_component: 0 (0x00)')
console.log('  req_stream_id: 1 (0x01)')
console.log('  req_message_rate: 1 (0x01 0x00)') // Little endian: 1 = 0x01 0x00
console.log('  start_stop: 1 (0x01)')
console.log('Checksum: 0x8234')
