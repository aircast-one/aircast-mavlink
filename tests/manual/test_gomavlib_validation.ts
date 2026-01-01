#!/usr/bin/env tsx

import { CommonSerializer } from '../../src/generated/dialects/common/full'
import { spawn } from 'child_process'

const serializer = new CommonSerializer()

// Test messages with the corrected MCRF4XX algorithm
const testMessages = [
  {
    description: 'HEARTBEAT message',
    message: {
      message_name: 'HEARTBEAT',
      system_id: 255,
      component_id: 190,
      sequence: 0,
      payload: {
        type: 6, // MAV_TYPE_GCS
        autopilot: 0, // MAV_AUTOPILOT_GENERIC
        base_mode: 0,
        custom_mode: 0,
        system_status: 4, // MAV_STATE_ACTIVE
        mavlink_version: 3,
      },
    },
  },
  {
    description: 'REQUEST_DATA_STREAM message (the problematic one)',
    message: {
      message_name: 'REQUEST_DATA_STREAM',
      system_id: 255,
      component_id: 190,
      sequence: 1,
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

async function validateWithGomavlib(
  messageBytes: Uint8Array,
  dialect: string,
  messageName: string
): Promise<any> {
  return new Promise((resolve, reject) => {
    const validator = spawn('./validator', [], {
      cwd: '/Users/pavliha/Code/aircast/aircast-mavlink/tests/go-validator',
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const request = {
      data: Array.from(messageBytes),
      dialect: dialect,
      message: messageName,
    }

    let stdout = ''
    let stderr = ''

    validator.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    validator.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    validator.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Validator exited with code ${code}: ${stderr}`))
        return
      }

      try {
        const result = JSON.parse(stdout)
        resolve(result)
      } catch (error) {
        reject(new Error(`Failed to parse JSON output: ${error}`))
      }
    })

    validator.stdin.write(JSON.stringify(request))
    validator.stdin.end()
  })
}

async function runTests() {
  console.log('🧪 Testing aircast-mavlink messages with gomavlib validation...\n')

  for (const test of testMessages) {
    console.log(`=== ${test.description} ===`)

    try {
      // Serialize the message using our corrected MCRF4XX implementation
      const serializedBytes = serializer.serialize(test.message)
      console.log('✅ Serialized successfully')
      console.log(
        '📦 Bytes:',
        Array.from(serializedBytes)
          .map((b: number) => '0x' + b.toString(16).padStart(2, '0'))
          .join(' ')
      )

      // Extract checksum for display
      const checksumLow = serializedBytes[serializedBytes.length - 2]
      const checksumHigh = serializedBytes[serializedBytes.length - 1]
      const checksum = checksumLow | (checksumHigh << 8)
      console.log(`🔐 Generated checksum: 0x${checksum.toString(16).padStart(4, '0')}`)

      // Validate with gomavlib (same library that SITL uses)
      const validationResult = await validateWithGomavlib(
        serializedBytes,
        'common',
        test.message.message_name
      )

      if (validationResult.success) {
        console.log('🎉 ✅ VALIDATION SUCCESSFUL!')
        console.log(`📋 Message ID: ${validationResult.message_id}`)
        console.log(
          `🆔 System ID: ${validationResult.system_id}, Component ID: ${validationResult.component_id}`
        )
        console.log(`🔢 Sequence: ${validationResult.sequence}`)
        console.log(`🔐 Checksum valid: ${validationResult.checksum_valid}`)

        if (test.message.message_name === 'REQUEST_DATA_STREAM') {
          console.log(
            '🚀 *** CRITICAL SUCCESS: REQUEST_DATA_STREAM is now compatible with gomavlib! ***'
          )
          console.log('    This means the MCRF4XX checksum fix is working correctly.')
        }
      } else {
        console.log('❌ VALIDATION FAILED')
        console.log(`❗ Error: ${validationResult.error}`)

        if (test.message.message_name === 'REQUEST_DATA_STREAM') {
          console.log('💥 *** CRITICAL FAILURE: REQUEST_DATA_STREAM still not compatible ***')
        }
      }
    } catch (error) {
      console.error('❌ Test failed:', error)

      if (test.message.message_name === 'REQUEST_DATA_STREAM') {
        console.log('💥 *** CRITICAL FAILURE: REQUEST_DATA_STREAM still not compatible ***')
      }
    }

    console.log('') // Empty line for readability
  }

  console.log('🏁 Testing complete!')
  console.log('\n📊 Summary:')
  console.log('✅ If REQUEST_DATA_STREAM validated successfully, the SITL checksum issue is FIXED')
  console.log('❌ If REQUEST_DATA_STREAM failed validation, there are still compatibility issues')
}

runTests().catch(console.error)
