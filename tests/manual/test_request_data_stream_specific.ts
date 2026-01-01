#!/usr/bin/env tsx

import {
  ArdupilotmegaSerializer,
  ArdupilotmegaParser,
} from '../../src/generated/dialects/ardupilotmega/full'
import { createConnection } from 'net'

const serializer = new ArdupilotmegaSerializer()
const parser = new ArdupilotmegaParser()

async function testRequestDataStreamSpecific() {
  console.log('🚀 Testing REQUEST_DATA_STREAM response specifically...\n')

  return new Promise<void>((resolve) => {
    let sequenceNumber = 0
    let gpsMessageCount = 0
    let dataStreamResponseCount = 0
    const messageTypeCounts: Record<number, number> = {}

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

      // Wait, then send REQUEST_DATA_STREAM for GPS
      setTimeout(() => {
        // Set up continuous heartbeats like the working test
        const heartbeatInterval = setInterval(() => {
          const hb = {
            message_name: 'HEARTBEAT',
            system_id: 255,
            component_id: 190,
            sequence: sequenceNumber++ % 256,
            payload: {
              type: 6, // GCS
              autopilot: 0,
              base_mode: 1,
              custom_mode: 0,
              system_status: 4,
              mavlink_version: 3,
            },
          }
          socket.write(serializer.serialize(hb))
        }, 1000)

        // Try multiple stream IDs to maximize chances of getting GPS data
        const streams = [
          { id: 0, name: 'ALL', rate: 1 },
          { id: 1, name: 'RAW_SENSORS', rate: 2 },
          { id: 2, name: 'EXTENDED_STATUS', rate: 2 },
          { id: 6, name: 'POSITION', rate: 2 },
          { id: 10, name: 'EXTRA1', rate: 2 },
          { id: 11, name: 'EXTRA2', rate: 2 },
        ]

        // Send requests for multiple streams with delays
        streams.forEach((stream, index) => {
          setTimeout(() => {
            const requestDataStream = {
              message_name: 'REQUEST_DATA_STREAM',
              system_id: 255,
              component_id: 190,
              sequence: sequenceNumber++,
              payload: {
                target_system: 1,
                target_component: 1,
                req_stream_id: stream.id,
                req_message_rate: stream.rate,
                start_stop: 1,
              },
            }

            console.log(
              `📤 Sending REQUEST_DATA_STREAM for ${stream.name} (ID ${stream.id}, ${stream.rate}Hz)...`
            )
            const frame = serializer.serialize(requestDataStream)
            console.log(
              '   Frame checksum:',
              '0x' +
                (frame[frame.length - 2] | (frame[frame.length - 1] << 8))
                  .toString(16)
                  .padStart(4, '0')
            )
            socket.write(frame)
          }, index * 500) // Stagger requests every 500ms
        })

        // Store interval for cleanup
        socket.on('close', () => {
          clearInterval(heartbeatInterval)
        })

        console.log('⏳ Monitoring responses for GPS and DATA_STREAM messages...\n')

        // Close after 15 seconds to give GPS time to get a fix
        setTimeout(() => {
          console.log(`\n📊 RESULTS SUMMARY:`)
          console.log(`   GPS_RAW_INT messages (ID 24): ${gpsMessageCount}`)
          console.log(`   DATA_STREAM responses (ID 67): ${dataStreamResponseCount}`)

          console.log('\n📡 All message types received:')
          Object.entries(messageTypeCounts)
            .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
            .forEach(([msgId, count]) => {
              const msgNames: Record<string, string> = {
                '0': 'HEARTBEAT',
                '1': 'SYS_STATUS',
                '3': 'SYSTEM_TIME',
                '6': 'SET_MODE',
                '11': 'SET_MODE',
                '17': 'SERVO_OUTPUT_RAW',
                '24': 'GPS_RAW_INT',
                '26': 'RAW_IMU',
                '30': 'ATTITUDE',
                '33': 'GLOBAL_POSITION_INT',
                '37': 'LOCAL_POSITION_NED',
                '47': 'MISSION_ITEM',
                '67': 'DATA_STREAM',
                '74': 'VFR_HUD',
                '96': 'OPTICAL_FLOW',
                '100': 'OPTICAL_FLOW_RAD',
                '112': 'HIL_SENSOR',
                '116': 'SCALED_IMU2',
                '123': 'HIL_GPS',
                '124': 'HIL_OPTICAL_FLOW',
                '135': 'HIL_SENSOR',
                '147': 'BATTERY_STATUS',
                '162': 'FENCE_STATUS',
                '163': 'MAG_CAL_PROGRESS',
                '164': 'EKF_STATUS_REPORT',
                '176': 'RANGEFINDER',
                '185': 'SENSOR_OFFSETS',
                '186': 'SET_MAG_OFFSETS',
                '190': 'SENSOR_OFFSETS',
                '193': 'EFI_STATUS',
                '194': 'ESTIMATOR_STATUS',
                '238': 'LANDING_TARGET',
                '253': 'STATUSTEXT',
              }
              const name = msgNames[msgId] || `UNKNOWN_${msgId}`
              console.log(`   ID ${msgId.padStart(3)} (${name}): ${count} messages`)
            })

          if (gpsMessageCount > 0) {
            console.log('\n🎉 ✅ SUCCESS! REQUEST_DATA_STREAM is working!')
            console.log('   SITL is sending GPS telemetry as requested')
          } else if (dataStreamResponseCount > 0) {
            console.log('\n⚠️  PARTIAL SUCCESS: SITL acknowledged the request but no GPS data yet')
            console.log('   Try requesting different stream IDs or check SITL GPS configuration')
          } else {
            console.log('\n❌ REQUEST_DATA_STREAM may not be working as expected')
          }

          socket.end()
          resolve()
        }, 15000)
      }, 1000)
    })

    socket.on('data', (data) => {
      // Use the proper parser instead of manual parsing
      const messages = parser.parseBytes(data)

      for (const msg of messages) {
        const messageId = msg.message_id

        // Count all message types
        messageTypeCounts[messageId] = (messageTypeCounts[messageId] || 0) + 1

        // Check for specific messages we care about
        if (msg.message_name === 'GPS_RAW_INT') {
          gpsMessageCount++
          console.log(`🛰️  GPS_RAW_INT #${gpsMessageCount} received from SITL`)

          // Parse GPS data from the payload
          const payload = msg.payload as any
          if (payload.lat && payload.lon) {
            console.log(
              `   Lat: ${payload.lat / 1e7}°, Lon: ${payload.lon / 1e7}°, Alt: ${payload.alt / 1000}m`
            )
            console.log(`   Satellites: ${payload.satellites_visible}, Fix: ${payload.fix_type}`)
          }
        } else if (msg.message_name === 'GLOBAL_POSITION_INT') {
          console.log(`🌍 GLOBAL_POSITION_INT received from SITL`)
          const payload = msg.payload as any
          if (payload.lat && payload.lon) {
            console.log(
              `   Global Pos - Lat: ${payload.lat / 1e7}°, Lon: ${payload.lon / 1e7}°, Alt: ${payload.alt / 1000}m`
            )
          }
        } else if (msg.message_name === 'RAW_IMU') {
          console.log(`📊 RAW_IMU received from SITL`)
        } else if (msg.message_name === 'ATTITUDE') {
          console.log(`✈️  ATTITUDE received from SITL`)
        } else if (msg.message_name === 'SYS_STATUS') {
          console.log(`⚙️  SYS_STATUS received from SITL`)
        } else if (msg.message_name === 'VFR_HUD') {
          console.log(`📈 VFR_HUD received from SITL`)
        } else if (msg.message_name === 'DATA_STREAM') {
          dataStreamResponseCount++
          console.log(
            `📊 DATA_STREAM response #${dataStreamResponseCount} - SITL acknowledged stream request`
          )
        } else if (msg.message_name === 'HEARTBEAT') {
          // Don't log every heartbeat, just the first few
          if (messageTypeCounts[0] <= 2) {
            console.log('💓 HEARTBEAT from SITL')
          }
        } else if (msg.message_name === 'STATUSTEXT') {
          const payload = msg.payload as any
          if (payload.text && payload.text.trim()) {
            console.log(`📝 STATUSTEXT: "${payload.text}"`)
          }
        } else {
          // Log other interesting message types (only first occurrence)
          if (messageTypeCounts[messageId] === 1) {
            console.log(`📡 New message type: ${msg.message_name} (ID ${messageId}) from SITL`)
          }
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

testRequestDataStreamSpecific().catch(console.error)
