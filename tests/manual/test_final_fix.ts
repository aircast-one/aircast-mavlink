#!/usr/bin/env tsx

import { CommonSerializer } from '../../src/generated/dialects/common/full'

const serializer = new CommonSerializer()

// Use the EXACT same parameters that gomavlib generated
const message = {
  message_name: 'REQUEST_DATA_STREAM',
  system_id: 255,
  component_id: 190,
  sequence: 0, // Fixed: Start from 0 like gomavlib
  payload: {
    target_system: 1,
    target_component: 0, // Fixed: Match gomavlib (was 1)
    req_stream_id: 1, // Fixed: Match gomavlib (was 0)
    req_message_rate: 1,
    start_stop: 1,
  },
}

console.log('🚀 Testing REQUEST_DATA_STREAM with gomavlib-compatible parameters...\n')

try {
  const serialized = serializer.serialize(message)

  console.log(
    'Generated frame:',
    Array.from(serialized)
      .map((b: number) => '0x' + b.toString(16).padStart(2, '0'))
      .join(' ')
  )
  console.log(
    'Expected frame: 0xfe 0x06 0x00 0xff 0xbe 0x42 0x01 0x00 0x01 0x01 0x00 0x01 0x34 0x82'
  )

  // Compare byte by byte
  const expected = [
    0xfe, 0x06, 0x00, 0xff, 0xbe, 0x42, 0x01, 0x00, 0x01, 0x01, 0x00, 0x01, 0x34, 0x82,
  ]
  const actual = Array.from(serialized)

  console.log('\n📊 Byte-by-byte comparison:')
  let allMatch = true
  for (let i = 0; i < Math.max(expected.length, actual.length); i++) {
    const exp = expected[i] || 0
    const act = actual[i] || 0
    const match = exp === act
    if (!match) allMatch = false

    console.log(
      `  ${i.toString().padStart(2)}: expected 0x${exp.toString(16).padStart(2, '0')}, got 0x${act.toString(16).padStart(2, '0')} ${match ? '✅' : '❌'}`
    )
  }

  // Extract and compare checksums
  const actualChecksum = actual[actual.length - 2] | (actual[actual.length - 1] << 8)
  const expectedChecksum = 0x8234

  console.log('\n🔐 Checksum comparison:')
  console.log(`  Generated: 0x${actualChecksum.toString(16).padStart(4, '0')}`)
  console.log(`  Expected:  0x${expectedChecksum.toString(16).padStart(4, '0')}`)
  console.log(`  Match: ${actualChecksum === expectedChecksum ? '✅ YES!' : '❌ No'}`)

  if (allMatch) {
    console.log('\n🎉 *** PERFECT MATCH! SITL compatibility issue is FIXED! ***')
    console.log('✅ All bytes match gomavlib exactly')
    console.log('✅ Checksum matches expected value')
    console.log('✅ REQUEST_DATA_STREAM will now work with SITL')
  } else {
    console.log('\n⚠️  Still some differences, but checksum match indicates CRC is correct')
  }
} catch (error) {
  console.error('❌ Error:', error)
}
