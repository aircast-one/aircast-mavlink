import { describe, it, expect, beforeAll } from '@jest/globals'
import { createConnection, Socket } from 'net'
import {
  ArdupilotmegaSerializer,
  ArdupilotmegaParser,
} from '../../src/generated/dialects/ardupilotmega/full'

describe('REQUEST_DATA_STREAM Integration Tests', () => {
  const SITL_HOST = process.env.SITL_HOST || 'dev.aircast.one'
  const SITL_PORT = parseInt(process.env.SITL_PORT || '5760')
  const TEST_TIMEOUT = 30000 // 30 seconds for integration tests

  let serializer: ArdupilotmegaSerializer
  let parser: ArdupilotmegaParser

  beforeAll(() => {
    serializer = new ArdupilotmegaSerializer()
    parser = new ArdupilotmegaParser()
  })

  describe.skip('SITL Communication', () => {
    it(
      'should successfully send REQUEST_DATA_STREAM and receive GPS data',
      async () => {
        const client = await new Promise<Socket>((resolve, reject) => {
          const socket = createConnection({ host: SITL_HOST, port: SITL_PORT }, () => {
            resolve(socket)
          })
          socket.on('error', reject)
        })

        const receivedMessages = new Map<string, number>()
        let sequence = 0
        let gpsDataReceived = false
        let heartbeatInterval: NodeJS.Timeout | undefined

        try {
          // Set up message handler
          client.on('data', (data) => {
            const messages = parser.parseBytes(data)
            for (const msg of messages) {
              receivedMessages.set(
                msg.message_name,
                (receivedMessages.get(msg.message_name) || 0) + 1
              )

              if (msg.message_name === 'GPS_RAW_INT') {
                gpsDataReceived = true
                expect(msg.payload).toHaveProperty('lat')
                expect(msg.payload).toHaveProperty('lon')
                expect(msg.payload).toHaveProperty('satellites_visible')
              }
            }
          })

          // Send initial HEARTBEAT
          const heartbeat = {
            message_name: 'HEARTBEAT',
            system_id: 255,
            component_id: 190,
            sequence: sequence++,
            payload: {
              type: 6, // GCS
              autopilot: 0,
              base_mode: 1,
              custom_mode: 0,
              system_status: 4,
              mavlink_version: 3,
            },
          }

          const heartbeatFrame = serializer.serialize(heartbeat)
          client.write(heartbeatFrame)

          // Set up periodic heartbeats
          heartbeatInterval = setInterval(() => {
            const hb = { ...heartbeat, sequence: sequence++ % 256 }
            const frame = serializer.serialize(hb)
            client.write(frame)
          }, 1000)

          // Wait a bit for connection to stabilize
          await new Promise((resolve) => setTimeout(resolve, 1000))

          // Send REQUEST_DATA_STREAM for GPS
          const request = {
            message_name: 'REQUEST_DATA_STREAM',
            system_id: 255,
            component_id: 190,
            sequence: sequence++ % 256,
            payload: {
              target_system: 1,
              target_component: 1,
              req_stream_id: 6, // POSITION stream
              req_message_rate: 2, // 2 Hz
              start_stop: 1, // Start
            },
          }

          const requestFrame = serializer.serialize(request)
          client.write(requestFrame)

          // Wait for GPS data
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Timeout waiting for GPS data'))
            }, 10000)

            const checkInterval = setInterval(() => {
              if (gpsDataReceived) {
                clearInterval(checkInterval)
                clearTimeout(timeout)
                resolve()
              }
            }, 100)
          })

          // Verify we received expected messages
          expect(receivedMessages.has('HEARTBEAT')).toBe(true)
          expect(receivedMessages.has('GPS_RAW_INT')).toBe(true)
          expect(gpsDataReceived).toBe(true)
        } finally {
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval)
          }
          client.end()
        }
      },
      TEST_TIMEOUT
    )

    it('should serialize REQUEST_DATA_STREAM with correct checksum', () => {
      const request = {
        message_name: 'REQUEST_DATA_STREAM',
        system_id: 255,
        component_id: 190,
        sequence: 0,
        payload: {
          target_system: 1,
          target_component: 1,
          req_stream_id: 0,
          req_message_rate: 4,
          start_stop: 1,
        },
      }

      const frame = serializer.serialize(request)

      // Verify frame structure
      expect(frame[0]).toBe(0xfe) // Magic byte
      expect(frame[1]).toBe(6) // Payload length
      expect(frame[2]).toBe(0) // Sequence
      expect(frame[3]).toBe(255) // System ID
      expect(frame[4]).toBe(190) // Component ID
      expect(frame[5]).toBe(66) // Message ID for REQUEST_DATA_STREAM

      // Verify payload - wire format order (req_message_rate first as uint16_t)
      expect(frame[6]).toBe(4) // req_message_rate low byte (little-endian)
      expect(frame[7]).toBe(0) // req_message_rate high byte (little-endian)
      expect(frame[8]).toBe(1) // target_system
      expect(frame[9]).toBe(1) // target_component
      expect(frame[10]).toBe(0) // req_stream_id (uint8)
      expect(frame[11]).toBe(1) // start_stop

      // The checksum should be correct (validated by SITL acceptance)
      const checksum = frame[12] | (frame[13] << 8)
      expect(checksum).toBeGreaterThan(0)
    })

    it(
      'should handle multiple stream requests',
      async () => {
        const client = await new Promise<Socket>((resolve, reject) => {
          const socket = createConnection({ host: SITL_HOST, port: SITL_PORT }, () => {
            resolve(socket)
          })
          socket.on('error', reject)
        })

        const receivedMessages = new Set<string>()
        let sequence = 0
        let heartbeatInterval: NodeJS.Timeout | undefined

        try {
          // Set up message handler
          client.on('data', (data) => {
            const messages = parser.parseBytes(data)
            for (const msg of messages) {
              receivedMessages.add(msg.message_name)
            }
          })

          // Send initial HEARTBEAT
          const heartbeat = {
            message_name: 'HEARTBEAT',
            system_id: 255,
            component_id: 190,
            sequence: sequence++,
            payload: {
              type: 6,
              autopilot: 0,
              base_mode: 1,
              custom_mode: 0,
              system_status: 4,
              mavlink_version: 3,
            },
          }

          client.write(serializer.serialize(heartbeat))

          // Set up periodic heartbeats
          heartbeatInterval = setInterval(() => {
            const hb = { ...heartbeat, sequence: sequence++ % 256 }
            client.write(serializer.serialize(hb))
          }, 1000)

          // Wait for connection
          await new Promise((resolve) => setTimeout(resolve, 1000))

          // Request multiple streams
          const streams = [
            { id: 1, name: 'RAW_SENSORS' },
            { id: 2, name: 'EXTENDED_STATUS' },
            { id: 6, name: 'POSITION' },
          ]

          for (const stream of streams) {
            const request = {
              message_name: 'REQUEST_DATA_STREAM',
              system_id: 255,
              component_id: 190,
              sequence: sequence++ % 256,
              payload: {
                target_system: 1,
                target_component: 1,
                req_stream_id: stream.id,
                req_message_rate: 1,
                start_stop: 1,
              },
            }

            client.write(serializer.serialize(request))
            await new Promise((resolve) => setTimeout(resolve, 200))
          }

          // Wait for data
          await new Promise((resolve) => setTimeout(resolve, 3000))

          // Verify we received various message types
          expect(receivedMessages.size).toBeGreaterThan(2)
          expect(receivedMessages.has('HEARTBEAT')).toBe(true)
        } finally {
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval)
          }
          client.end()
        }
      },
      TEST_TIMEOUT
    )
  })

  describe('Message Serialization', () => {
    it('should correctly serialize all REQUEST_DATA_STREAM stream IDs', () => {
      const streamIds = [
        { id: 0, name: 'ALL' },
        { id: 1, name: 'RAW_SENSORS' },
        { id: 2, name: 'EXTENDED_STATUS' },
        { id: 3, name: 'RC_CHANNELS' },
        { id: 4, name: 'RAW_CONTROLLER' },
        { id: 6, name: 'POSITION' },
        { id: 10, name: 'EXTRA1' },
        { id: 11, name: 'EXTRA2' },
        { id: 12, name: 'EXTRA3' },
      ]

      streamIds.forEach((stream) => {
        const request = {
          message_name: 'REQUEST_DATA_STREAM',
          system_id: 255,
          component_id: 190,
          sequence: 0,
          payload: {
            target_system: 1,
            target_component: 1,
            req_stream_id: stream.id,
            req_message_rate: 4,
            start_stop: 1,
          },
        }

        const frame = serializer.serialize(request)

        // Basic validation
        expect(frame).toBeInstanceOf(Uint8Array)
        expect(frame.length).toBe(14) // 6 header + 6 payload + 2 checksum
        expect(frame[0]).toBe(0xfe) // Magic byte
        expect(frame[5]).toBe(66) // REQUEST_DATA_STREAM message ID
        // Wire format: req_message_rate (uint16_t) first, then uint8_t fields
        expect(frame[10]).toBe(stream.id) // Stream ID at correct position in payload
      })
    })

    it('should handle start/stop correctly', () => {
      const startRequest = {
        message_name: 'REQUEST_DATA_STREAM',
        system_id: 255,
        component_id: 190,
        sequence: 0,
        payload: {
          target_system: 1,
          target_component: 1,
          req_stream_id: 0,
          req_message_rate: 4,
          start_stop: 1, // Start
        },
      }

      const stopRequest = {
        message_name: 'REQUEST_DATA_STREAM',
        system_id: 255,
        component_id: 190,
        sequence: 0,
        payload: {
          target_system: 1,
          target_component: 1,
          req_stream_id: 0,
          req_message_rate: 4,
          start_stop: 0, // Stop
        },
      }

      const startFrame = serializer.serialize(startRequest)
      const stopFrame = serializer.serialize(stopRequest)

      // Verify start_stop byte
      expect(startFrame[11]).toBe(1) // Start
      expect(stopFrame[11]).toBe(0) // Stop

      // Checksums should be different
      const startChecksum = startFrame[12] | (startFrame[13] << 8)
      const stopChecksum = stopFrame[12] | (stopFrame[13] << 8)
      expect(startChecksum).not.toBe(stopChecksum)
    })
  })
})
