#!/usr/bin/env tsx

import { CommonSerializer } from '../../src/generated/dialects/common/full'
import { createConnection } from 'net'

const serializer = new CommonSerializer()

async function testMAVLinkV2() {
  console.log('🚀 Testing REQUEST_DATA_STREAM with MAVLink v2 like QGroundControl...\n')

  return new Promise<void>((resolve) => {
    let sequenceNumber = 0
    let gpsMessageCount = 0
    let dataStreamCount = 0

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

      setTimeout(() => {
        // Try the exact parameters from QGroundControl
        // From hex: 00 00 02 00 01 01
        // target_system=0, target_component=0, req_stream_id=2, req_message_rate=256, start_stop=1

        const qgcParams = [
          {
            target_system: 1,
            target_component: 0,
            req_stream_id: 2,
            req_message_rate: 1,
            start_stop: 1,
            name: 'Raw sensors',
          },
          {
            target_system: 1,
            target_component: 0,
            req_stream_id: 3,
            req_message_rate: 1,
            start_stop: 1,
            name: 'Extended status',
          },
          {
            target_system: 1,
            target_component: 0,
            req_stream_id: 10,
            req_message_rate: 1,
            start_stop: 1,
            name: 'Extra1',
          },
          {
            target_system: 1,
            target_component: 0,
            req_stream_id: 0,
            req_message_rate: 1,
            start_stop: 1,
            name: 'All streams',
          },
        ]

        qgcParams.forEach((params, index) => {
          setTimeout(() => {
            const request = {
              message_name: 'REQUEST_DATA_STREAM',
              system_id: 255,
              component_id: 190,
              sequence: sequenceNumber++,
              payload: params,
            }

            console.log(
              `📤 Sending REQUEST_DATA_STREAM - ${params.name} (stream ${params.req_stream_id})...`
            )
            const frame = serializer.serialize(request)
            console.log(
              `   Frame: ${Array.from(frame)
                .map((b) => '0x' + b.toString(16).padStart(2, '0'))
                .join(' ')}`
            )
            socket.write(frame)
          }, index * 2000) // 2 second intervals
        })

        // Monitor for responses
        setTimeout(() => {
          console.log(`\n📊 RESULTS AFTER 15 SECONDS:`)
          console.log(`   GPS_RAW_INT messages: ${gpsMessageCount}`)
          console.log(`   DATA_STREAM responses: ${dataStreamCount}`)

          if (gpsMessageCount > 0) {
            console.log('\n🎉 ✅ SUCCESS! GPS telemetry is now flowing!')
            console.log('   QGroundControl-style parameters work with SITL')
          } else if (dataStreamCount > 0) {
            console.log('\n⚠️  SITL acknowledged but no GPS data yet')
          } else {
            console.log('\n❌ Still no response - may need different approach')
          }

          socket.end()
          resolve()
        }, 15000)
      }, 1000)
    })

    let receivedData = Buffer.alloc(0)

    socket.on('data', (data) => {
      receivedData = Buffer.concat([receivedData, data])

      // Parse both MAVLink v1 and v2
      while (receivedData.length > 0) {
        let magicIndex = -1
        let version = 0

        // Look for v1 (0xFE) or v2 (0xFD) magic
        const v1Index = receivedData.indexOf(0xfe)
        const v2Index = receivedData.indexOf(0xfd)

        if (v1Index !== -1 && (v2Index === -1 || v1Index < v2Index)) {
          magicIndex = v1Index
          version = 1
        } else if (v2Index !== -1) {
          magicIndex = v2Index
          version = 2
        }

        if (magicIndex === -1) break

        if (magicIndex > 0) {
          receivedData = receivedData.slice(magicIndex)
        }

        const minFrameSize = version === 1 ? 8 : 12
        if (receivedData.length < minFrameSize) break

        const length = receivedData[1]
        const totalFrameSize = length + minFrameSize

        if (receivedData.length < totalFrameSize) break

        const frame = receivedData.slice(0, totalFrameSize)
        receivedData = receivedData.slice(totalFrameSize)

        const messageId = version === 1 ? frame[5] : frame[7]

        if (messageId === 24) {
          // GPS_RAW_INT
          gpsMessageCount++
          console.log(`🛰️  GPS_RAW_INT #${gpsMessageCount} - GPS telemetry working!`)
        } else if (messageId === 67) {
          // DATA_STREAM
          dataStreamCount++
          console.log(`📊 DATA_STREAM response #${dataStreamCount} - SITL acknowledged`)
        } else if (messageId === 0 && gpsMessageCount === 0) {
          console.log('💓 HEARTBEAT from SITL')
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

testMAVLinkV2().catch(console.error)
