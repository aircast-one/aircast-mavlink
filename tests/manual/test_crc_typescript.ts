#!/usr/bin/env tsx

import { MAVLinkCRC } from '../../src/core/crc'

// Test the TypeScript CRC implementation with the working combination
console.log('Testing TypeScript CRC implementation...')

// Working combination from Python:
// target_system: 0, target_component: 2, req_stream_id: 178, req_message_rate: 1, start_stop: 1
// sequence: 0, sys_id: 1, comp_id: 1

const length = 6
const seq = 0
const sys_id = 1
const comp_id = 1
const msg_id = 66

// Pack payload: target_system, target_component, req_stream_id, req_message_rate (uint16_t), start_stop
const payload = new Uint8Array(6)
payload[0] = 0 // target_system
payload[1] = 2 // target_component
payload[2] = 178 // req_stream_id
payload[3] = 1 // req_message_rate low byte
payload[4] = 0 // req_message_rate high byte
payload[5] = 1 // start_stop

console.log(
  'Payload:',
  Array.from(payload)
    .map((b: number) => '0x' + b.toString(16).padStart(2, '0'))
    .join(' ')
)

// Create message data (everything except magic byte and checksum)
const messageData = new Uint8Array(5 + payload.length)
messageData[0] = length
messageData[1] = seq
messageData[2] = sys_id
messageData[3] = comp_id
messageData[4] = msg_id
messageData.set(payload, 5)

console.log(
  'Message data:',
  Array.from(messageData)
    .map((b: number) => '0x' + b.toString(16).padStart(2, '0'))
    .join(' ')
)

const crcExtra = 148
const calculatedCrc = MAVLinkCRC.calculate(messageData, crcExtra)

console.log(`Calculated CRC: 0x${calculatedCrc.toString(16).padStart(4, '0')}`)
console.log(`Expected: 0x003c`)
console.log(`Match: ${calculatedCrc === 0x003c ? '✅ YES' : '❌ NO'}`)

// Create full packet
const fullPacket = new Uint8Array(8 + payload.length)
fullPacket[0] = 0xfe // magic
fullPacket.set(messageData, 1)
fullPacket[fullPacket.length - 2] = calculatedCrc & 0xff // checksum low
fullPacket[fullPacket.length - 1] = (calculatedCrc >> 8) & 0xff // checksum high

console.log(
  'Full packet:',
  Array.from(fullPacket)
    .map((b: number) => '0x' + b.toString(16).padStart(2, '0'))
    .join(' ')
)
console.log('Expected:    0xfe 0x06 0x00 0x01 0x01 0x42 0x00 0x02 0xb2 0x01 0x00 0x01 0x3c 0x00')
