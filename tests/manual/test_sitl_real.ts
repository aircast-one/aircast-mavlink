#!/usr/bin/env tsx

import { CommonSerializer } from '../../src/generated/dialects/common/full'
import { createConnection } from 'net'

// Test with your actual SITL instance
const SITL_HOST = 'dev.aircast.one'
const SITL_PORT = 5762

const serializer = new CommonSerializer()

// First, let's send a HEARTBEAT to establish connection
const heartbeatMessage = {
  message_name: 'HEARTBEAT',
  system_id: 255, // GCS system ID
  component_id: 190, // GCS component ID
  sequence: 0,
  payload: {
    type: 6, // MAV_TYPE_GCS
    autopilot: 0, // MAV_AUTOPILOT_GENERIC
    base_mode: 0,
    custom_mode: 0,
    system_status: 4, // MAV_STATE_ACTIVE
    mavlink_version: 3,
  },
}

// Then send REQUEST_DATA_STREAM
const requestDataStreamMessage = {
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
}

async function testSITLConnection() {
  return new Promise((resolve, reject) => {
    console.log(`Connecting to SITL at ${SITL_HOST}:${SITL_PORT}...`)

    const client = createConnection(SITL_PORT, SITL_HOST)
    let receivedData = Buffer.alloc(0)
    let timeout: NodeJS.Timeout

    client.on('connect', () => {
      console.log('✅ Connected to SITL!')

      try {
        // Send HEARTBEAT first
        const heartbeatBytes = serializer.serialize(heartbeatMessage)
        console.log('\n📤 Sending HEARTBEAT...')
        console.log(
          'Heartbeat bytes:',
          Array.from(heartbeatBytes)
            .map((b) => '0x' + b.toString(16).padStart(2, '0'))
            .join(' ')
        )
        client.write(heartbeatBytes)

        // Wait a moment, then send REQUEST_DATA_STREAM
        setTimeout(() => {
          const requestBytes = serializer.serialize(requestDataStreamMessage)
          console.log('\n📤 Sending REQUEST_DATA_STREAM...')
          console.log(
            'Request bytes:',
            Array.from(requestBytes)
              .map((b) => '0x' + b.toString(16).padStart(2, '0'))
              .join(' ')
          )
          console.log(
            `Generated checksum: 0x${(requestBytes[requestBytes.length - 2] | (requestBytes[requestBytes.length - 1] << 8)).toString(16).padStart(4, '0')}`
          )
          client.write(requestBytes)

          // Set timeout to wait for response
          timeout = setTimeout(() => {
            console.log('\n⏰ No response received within 5 seconds')
            client.end()
            resolve('timeout')
          }, 5000)
        }, 1000)
      } catch (error) {
        console.error('❌ Error serializing messages:', error)
        client.end()
        reject(error)
      }
    })

    client.on('data', (data) => {
      receivedData = Buffer.concat([receivedData, data])
      console.log('\n📥 Received data from SITL:')
      console.log(
        'Raw bytes:',
        Array.from(data)
          .map((b) => '0x' + b.toString(16).padStart(2, '0'))
          .join(' ')
      )

      // Try to parse as MAVLink
      if (data.length >= 8) {
        const magic = data[0]
        const length = data[1]
        const sequence = data[2]
        const systemId = data[3]
        const componentId = data[4]
        const messageId = data[5]

        console.log(
          `📋 MAVLink frame: magic=0x${magic.toString(16)}, len=${length}, seq=${sequence}, sys=${systemId}, comp=${componentId}, msg=${messageId}`
        )

        if (data.length >= 8 + length) {
          const checksum = data[6 + length] | (data[7 + length] << 8)
          console.log(`📋 Checksum: 0x${checksum.toString(16).padStart(4, '0')}`)
        }
      }

      clearTimeout(timeout)
      client.end()
      resolve('success')
    })

    client.on('error', (err) => {
      console.error('❌ Connection error:', err.message)
      clearTimeout(timeout)
      reject(err)
    })

    client.on('close', () => {
      console.log('🔌 Connection closed')
      if (!receivedData.length) {
        console.log('⚠️ No data received from SITL')
        resolve('no_data')
      }
    })
  })
}

testSITLConnection()
  .then((result) => {
    console.log('\n🏁 Test completed:', result)
    if (result === 'success') {
      console.log('✅ SITL accepted the messages with new MCRF4XX checksum!')
    } else if (result === 'no_data') {
      console.log('⚠️ SITL may have rejected the messages (no response)')
    }
  })
  .catch((error) => {
    console.error('❌ Test failed:', error)
  })
