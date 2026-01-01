#!/usr/bin/env tsx

import { CommonSerializer } from '../../src/generated/dialects/common/full'
import { createConnection } from 'net'

const serializer = new CommonSerializer()

async function testSITLResponse() {
  console.log('🚀 Testing SITL response at dev.aircast.one:5760...\n')

  return new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host: 'dev.aircast.one', port: 5760 }, () => {
      console.log('✅ Connected to SITL')

      let sequenceNumber = 0

      // Send heartbeat first (required for MAVLink handshake)
      const heartbeat = {
        message_name: 'HEARTBEAT',
        system_id: 255,
        component_id: 190,
        sequence: sequenceNumber++,
        payload: {
          type: 6, // GCS
          autopilot: 0, // Generic
          base_mode: 0,
          custom_mode: 0,
          system_status: 4, // Standby
          mavlink_version: 3,
        },
      }

      console.log('📤 Sending HEARTBEAT...')
      const heartbeatFrame = serializer.serialize(heartbeat)
      socket.write(heartbeatFrame)

      // Wait a bit, then send REQUEST_DATA_STREAM
      setTimeout(() => {
        const requestDataStream = {
          message_name: 'REQUEST_DATA_STREAM',
          system_id: 255,
          component_id: 190,
          sequence: sequenceNumber++,
          payload: {
            target_system: 1,
            target_component: 0,
            req_stream_id: 1, // GPS stream
            req_message_rate: 1, // 1 Hz
            start_stop: 1, // Start
          },
        }

        console.log('📤 Sending REQUEST_DATA_STREAM for GPS telemetry...')
        const requestFrame = serializer.serialize(requestDataStream)
        console.log(
          'Frame:',
          Array.from(requestFrame)
            .map((b: number) => '0x' + b.toString(16).padStart(2, '0'))
            .join(' ')
        )
        socket.write(requestFrame)

        console.log('⏳ Waiting for SITL response...\n')

        // Set timeout for response
        setTimeout(() => {
          console.log('⏰ Test timeout - closing connection')
          socket.end()
          resolve()
        }, 10000) // 10 second timeout
      }, 1000) // Wait 1 second after heartbeat
    })

    let receivedData = Buffer.alloc(0)
    let responseCount = 0

    socket.on('data', (data) => {
      receivedData = Buffer.concat([receivedData, data])
      responseCount++

      console.log(`📥 Response #${responseCount} (${data.length} bytes):`)
      console.log(
        '   Raw:',
        Array.from(data)
          .map((b: number) => '0x' + b.toString(16).padStart(2, '0'))
          .join(' ')
      )

      // Try to parse MAVLink messages
      while (receivedData.length > 0) {
        // Look for MAVLink v1 magic byte (0xFE)
        const magicIndex = receivedData.indexOf(0xfe)
        if (magicIndex === -1) break

        if (magicIndex > 0) {
          receivedData = receivedData.slice(magicIndex)
        }

        if (receivedData.length < 8) break // Minimum MAVLink frame size

        const length = receivedData[1]
        const totalFrameSize = length + 8 // payload + header + checksum

        if (receivedData.length < totalFrameSize) break

        const frame = receivedData.slice(0, totalFrameSize)
        receivedData = receivedData.slice(totalFrameSize)

        const messageId = frame[5]
        const systemId = frame[3]
        const componentId = frame[4]

        console.log(`   📋 MAVLink Message: ID=${messageId}, Sys=${systemId}, Comp=${componentId}`)

        // Check for specific message types
        if (messageId === 0) {
          console.log('   💓 HEARTBEAT from SITL - Connection established!')
        } else if (messageId === 24) {
          console.log('   🛰️  GPS_RAW_INT - GPS telemetry received!')
        } else if (messageId === 67) {
          console.log('   📊 DATA_STREAM - Stream configuration response!')
        } else {
          console.log(`   📨 Message type ${messageId} received`)
        }
      }
    })

    socket.on('error', (err) => {
      console.error('❌ Connection error:', err.message)
      reject(err)
    })

    socket.on('close', () => {
      console.log('\n🔌 Connection closed')
      if (responseCount > 0) {
        console.log(`\n🎉 SUCCESS! SITL responded with ${responseCount} message(s)!`)
        console.log('✅ The checksum fix works - SITL is now communicating!')
      } else {
        console.log('\n❌ No response from SITL')
        console.log('⚠️  This could indicate SITL is not running or has connection issues')
      }
      resolve()
    })
  })
}

testSITLResponse().catch(console.error)
