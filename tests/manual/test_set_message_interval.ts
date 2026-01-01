#!/usr/bin/env tsx

import { CommonSerializer } from '../../src/generated/dialects/common/full'
import { createConnection } from 'net'

const serializer = new CommonSerializer()

async function testSetMessageInterval() {
  console.log('🚀 Testing modern SET_MESSAGE_INTERVAL approach...\n')

  return new Promise<void>((resolve) => {
    let sequenceNumber = 0
    let gpsMessageCount = 0
    let positionMessageCount = 0

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
        // Request GPS_RAW_INT (message ID 24) at 2Hz
        const setGpsInterval = {
          message_name: 'SET_MESSAGE_INTERVAL',
          system_id: 255,
          component_id: 190,
          sequence: sequenceNumber++,
          payload: {
            target_system: 1,
            target_component: 0,
            message_id: 24, // GPS_RAW_INT
            interval_us: 500000, // 500ms = 2Hz
          },
        }

        console.log('📤 Requesting GPS_RAW_INT at 2Hz using SET_MESSAGE_INTERVAL...')
        socket.write(serializer.serialize(setGpsInterval))

        // Also request GLOBAL_POSITION_INT (message ID 33) at 1Hz
        setTimeout(() => {
          const setPosInterval = {
            message_name: 'SET_MESSAGE_INTERVAL',
            system_id: 255,
            component_id: 190,
            sequence: sequenceNumber++,
            payload: {
              target_system: 1,
              target_component: 0,
              message_id: 33, // GLOBAL_POSITION_INT
              interval_us: 1000000, // 1000ms = 1Hz
            },
          }

          console.log('📤 Requesting GLOBAL_POSITION_INT at 1Hz...')
          socket.write(serializer.serialize(setPosInterval))

          console.log('⏳ Monitoring for GPS and position messages...\n')
        }, 1000)

        // Monitor for 10 seconds
        setTimeout(() => {
          console.log(`\n📊 RESULTS:`)
          console.log(`   GPS_RAW_INT messages: ${gpsMessageCount}`)
          console.log(`   GLOBAL_POSITION_INT messages: ${positionMessageCount}`)

          if (gpsMessageCount > 0 || positionMessageCount > 0) {
            console.log('\n🎉 ✅ SUCCESS! Modern message interval approach works!')
            console.log('   SITL responds to SET_MESSAGE_INTERVAL commands')
            console.log(
              '   📝 NOTE: REQUEST_DATA_STREAM is deprecated - use SET_MESSAGE_INTERVAL instead'
            )
          } else {
            console.log('\n❌ Neither approach worked - may need different parameters')
          }

          socket.end()
          resolve()
        }, 10000)
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

        if (messageId === 24) {
          // GPS_RAW_INT
          gpsMessageCount++
          console.log(`🛰️  GPS_RAW_INT #${gpsMessageCount} - GPS telemetry flowing!`)
        } else if (messageId === 33) {
          // GLOBAL_POSITION_INT
          positionMessageCount++
          console.log(`🌍 GLOBAL_POSITION_INT #${positionMessageCount} - Position data flowing!`)
        } else if (messageId === 0 && gpsMessageCount === 0 && positionMessageCount === 0) {
          // Only log initial heartbeats
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

testSetMessageInterval().catch(console.error)
