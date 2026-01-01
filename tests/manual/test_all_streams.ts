#!/usr/bin/env tsx

import { CommonSerializer } from '../../src/generated/dialects/common/full'
import { createConnection } from 'net'

const serializer = new CommonSerializer()

async function testAllStreams() {
  console.log('🚀 Testing REQUEST_DATA_STREAM with different stream IDs...\n')

  return new Promise<void>((resolve) => {
    let sequenceNumber = 0
    const responses = new Map<number, number>() // messageId -> count

    const socket = createConnection({ host: 'dev.aircast.one', port: 5760 }, () => {
      console.log('✅ Connected to SITL')

      // Send heartbeat first
      const heartbeat = {
        message_name: 'HEARTBEAT',
        system_id: 255,
        component_id: 190,
        sequence: sequenceNumber++,
        payload: {
          type: 6, // GCS
          autopilot: 0,
          base_mode: 0,
          custom_mode: 0,
          system_status: 4,
          mavlink_version: 3,
        },
      }

      console.log('📤 Sending HEARTBEAT...')
      socket.write(serializer.serialize(heartbeat))

      // Wait, then try different stream requests
      setTimeout(() => {
        const streamRequests = [
          { id: 0, name: 'All streams' },
          { id: 1, name: 'Raw sensors' },
          { id: 2, name: 'Extended status' },
          { id: 3, name: 'RC channels' },
          { id: 6, name: 'Position' },
        ]

        streamRequests.forEach((stream, index) => {
          setTimeout(() => {
            const request = {
              message_name: 'REQUEST_DATA_STREAM',
              system_id: 255,
              component_id: 190,
              sequence: sequenceNumber++,
              payload: {
                target_system: 1,
                target_component: 0,
                req_stream_id: stream.id,
                req_message_rate: 2, // 2 Hz
                start_stop: 1, // Start
              },
            }

            console.log(`📤 Requesting stream ${stream.id} (${stream.name})...`)
            socket.write(serializer.serialize(request))
          }, index * 1000) // Space out requests by 1 second
        })

        // Monitor for 10 seconds after last request
        setTimeout(() => {
          console.log('\n📊 RESPONSE SUMMARY:')

          const interestingMessages = [
            { id: 0, name: 'HEARTBEAT' },
            { id: 24, name: 'GPS_RAW_INT' },
            { id: 33, name: 'GLOBAL_POSITION_INT' },
            { id: 67, name: 'DATA_STREAM' },
            { id: 74, name: 'VFR_HUD' },
            { id: 30, name: 'ATTITUDE' },
            { id: 65, name: 'RC_CHANNELS' },
          ]

          interestingMessages.forEach((msg) => {
            const count = responses.get(msg.id) || 0
            const status = count > 0 ? '✅' : '❌'
            console.log(`   ${status} ${msg.name} (ID ${msg.id}): ${count} messages`)
          })

          const gpsCount = responses.get(24) || 0
          const dataStreamCount = responses.get(67) || 0

          console.log('\n🔍 ANALYSIS:')
          if (gpsCount > 0) {
            console.log('✅ GPS telemetry is working! SITL is sending GPS_RAW_INT messages')
          } else if (dataStreamCount > 0) {
            console.log('⚠️  SITL acknowledges stream requests but GPS data not flowing')
          } else {
            console.log(
              '❌ No GPS or DATA_STREAM responses - REQUEST_DATA_STREAM may need different parameters'
            )
          }

          socket.end()
          resolve()
        }, 15000) // 15 seconds total
      }, 1000)
    })

    let receivedData = Buffer.alloc(0)

    socket.on('data', (data) => {
      receivedData = Buffer.concat([receivedData, data])

      while (receivedData.length > 0) {
        const magicIndex = receivedData.indexOf(0xfe)
        if (magicIndex === -1) break

        if (magicIndex > 0) {
          receivedData = receivedData.slice(magicIndex)
        }

        if (receivedData.length < 8) break

        const length = receivedData[1]
        const totalFrameSize = length + 8

        if (receivedData.length < totalFrameSize) break

        const frame = receivedData.slice(0, totalFrameSize)
        receivedData = receivedData.slice(totalFrameSize)

        const messageId = frame[5]

        // Count all message types
        responses.set(messageId, (responses.get(messageId) || 0) + 1)

        // Log interesting messages
        if (messageId === 24) {
          // GPS_RAW_INT
          console.log(`🛰️  GPS_RAW_INT received!`)
        } else if (messageId === 67) {
          // DATA_STREAM
          console.log(`📊 DATA_STREAM response received`)
        } else if (messageId === 33) {
          // GLOBAL_POSITION_INT
          console.log(`🌍 GLOBAL_POSITION_INT received`)
        }
      }
    })

    socket.on('error', (err) => {
      console.error('❌ Connection error:', err.message)
      resolve()
    })

    socket.on('close', () => {
      console.log('\n🔌 Connection closed')
      resolve()
    })
  })
}

testAllStreams().catch(console.error)
