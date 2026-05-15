import { parseFrame, createFrame, MAVLINK_V2_MAGIC } from '../../src/core/frame'
import { MAVLinkCRC } from '../../src/core/crc'

describe('parseFrame', () => {
  // CRC_EXTRA for HEARTBEAT (message ID 0) = 50
  const HEARTBEAT_CRC_EXTRA = 50
  const crcExtraTable: Record<number, number> = { 0: HEARTBEAT_CRC_EXTRA }

  function buildV2Frame(opts: {
    payload: Uint8Array
    messageId: number
    crcExtra: number
    systemId: number
    componentId: number
    sequence: number
    signed: boolean
    signature: Uint8Array | null
  }): Uint8Array {
    const incompatFlags = opts.signed ? 0x01 : 0x00

    // Build header (after magic)
    const header = new Uint8Array([
      opts.payload.length, // len
      incompatFlags, // incompat_flags
      0x00, // compat_flags
      opts.sequence,
      opts.systemId,
      opts.componentId,
      opts.messageId & 0xff,
      (opts.messageId >> 8) & 0xff,
      (opts.messageId >> 16) & 0xff,
    ])

    // Compute CRC over header + payload
    const crcInput = new Uint8Array(header.length + opts.payload.length)
    crcInput.set(header)
    crcInput.set(opts.payload, header.length)
    const checksum = MAVLinkCRC.calculate(crcInput, opts.crcExtra)

    // Build complete frame
    const signatureSize = opts.signed && opts.signature !== null ? opts.signature.length : 0
    const frame = new Uint8Array(1 + header.length + opts.payload.length + 2 + signatureSize)
    let offset = 0

    frame[offset++] = MAVLINK_V2_MAGIC
    frame.set(header, offset)
    offset += header.length
    frame.set(opts.payload, offset)
    offset += opts.payload.length
    frame[offset++] = checksum & 0xff
    frame[offset++] = (checksum >> 8) & 0xff

    if (opts.signed && opts.signature !== null) {
      frame.set(opts.signature, offset)
    }

    return frame
  }

  describe('v2 unsigned frames', () => {
    it('should validate CRC correctly for unsigned v2 frame', () => {
      const payload = new Uint8Array([
        0x04,
        0x00,
        0x00,
        0x00, // custom_mode
        0x02, // type
        0x03, // autopilot
        0x81, // base_mode
        0x04, // system_status
        0x03, // mavlink_version
      ])

      const frame = buildV2Frame({
        payload,
        messageId: 0,
        crcExtra: HEARTBEAT_CRC_EXTRA,
        systemId: 1,
        componentId: 1,
        sequence: 0,
        signed: false,
        signature: null,
      })

      const result = parseFrame(frame, crcExtraTable)

      expect(result.frame).toBeDefined()
      expect(result.frame!.crc_ok).toBe(true)
      expect(result.frame!.message_id).toBe(0)
      expect(result.frame!.protocol_version).toBe(2)
      expect(result.frame!.signature).toBeUndefined()
    })
  })

  describe('v2 signed frames', () => {
    it('should validate CRC correctly for signed v2 frame', () => {
      const payload = new Uint8Array([
        0x04,
        0x00,
        0x00,
        0x00, // custom_mode
        0x02, // type
        0x03, // autopilot
        0x81, // base_mode
        0x04, // system_status
        0x03, // mavlink_version
      ])

      // 13-byte dummy signature (link_id + timestamp + signature_bytes)
      const signature = new Uint8Array(13).fill(0xab)

      const frame = buildV2Frame({
        payload,
        messageId: 0,
        crcExtra: HEARTBEAT_CRC_EXTRA,
        systemId: 1,
        componentId: 1,
        sequence: 0,
        signed: true,
        signature,
      })

      const result = parseFrame(frame, crcExtraTable)

      expect(result.frame).toBeDefined()
      expect(result.frame!.crc_ok).toBe(true)
      expect(result.frame!.message_id).toBe(0)
      expect(result.frame!.protocol_version).toBe(2)
      expect(result.frame!.signature).toBeDefined()
      expect(result.frame!.signature!.length).toBe(13)
    })

    it('should not include signature bytes in CRC calculation', () => {
      const payload = new Uint8Array([0x04, 0x00, 0x00, 0x00, 0x02, 0x03, 0x81, 0x04, 0x03])

      // Create two frames with different signatures but same payload
      const sig1 = new Uint8Array(13).fill(0x00)
      const sig2 = new Uint8Array(13).fill(0xff)

      const frame1 = buildV2Frame({
        payload,
        messageId: 0,
        crcExtra: HEARTBEAT_CRC_EXTRA,
        systemId: 1,
        componentId: 1,
        sequence: 0,
        signed: true,
        signature: sig1,
      })

      const frame2 = buildV2Frame({
        payload,
        messageId: 0,
        crcExtra: HEARTBEAT_CRC_EXTRA,
        systemId: 1,
        componentId: 1,
        sequence: 0,
        signed: true,
        signature: sig2,
      })

      const result1 = parseFrame(frame1, crcExtraTable)
      const result2 = parseFrame(frame2, crcExtraTable)

      // Both should pass CRC validation — signature content doesn't affect CRC
      expect(result1.frame!.crc_ok).toBe(true)
      expect(result2.frame!.crc_ok).toBe(true)

      // Checksums should be identical
      expect(result1.frame!.checksum).toBe(result2.frame!.checksum)
    })

    it('should reject signed frame with corrupted payload', () => {
      const payload = new Uint8Array([0x04, 0x00, 0x00, 0x00, 0x02, 0x03, 0x81, 0x04, 0x03])

      const signature = new Uint8Array(13).fill(0xab)

      const frame = buildV2Frame({
        payload,
        messageId: 0,
        crcExtra: HEARTBEAT_CRC_EXTRA,
        systemId: 1,
        componentId: 1,
        sequence: 0,
        signed: true,
        signature,
      })

      // Corrupt a payload byte
      frame[10 + 2] = 0xff // Modify payload (after 10-byte v2 header)

      const result = parseFrame(frame, crcExtraTable)

      expect(result.frame).toBeDefined()
      expect(result.frame!.crc_ok).toBe(false)
    })

    it('should consume correct number of bytes for signed frame', () => {
      const payload = new Uint8Array([0x04, 0x00, 0x00, 0x00, 0x02, 0x03, 0x81, 0x04, 0x03])

      const signature = new Uint8Array(13).fill(0xab)

      const frame = buildV2Frame({
        payload,
        messageId: 0,
        crcExtra: HEARTBEAT_CRC_EXTRA,
        systemId: 1,
        componentId: 1,
        sequence: 0,
        signed: true,
        signature,
      })

      const result = parseFrame(frame, crcExtraTable)

      // magic(1) + header(9) + payload(9) + checksum(2) + signature(13) = 34
      expect(result.bytesConsumed).toBe(1 + 9 + 9 + 2 + 13)
    })
  })

  describe('edge cases', () => {
    it('should return 0 bytes consumed for data shorter than 8 bytes', () => {
      const result = parseFrame(new Uint8Array([0xfd, 0x01, 0x02]), crcExtraTable)
      expect(result.frame).toBeUndefined()
      expect(result.bytesConsumed).toBe(0)
    })

    it('should consume all bytes when no magic byte found', () => {
      const garbage = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08])
      const result = parseFrame(garbage, crcExtraTable)
      expect(result.frame).toBeUndefined()
      expect(result.bytesConsumed).toBe(8)
    })

    it('should skip garbage before magic byte', () => {
      const payload = new Uint8Array([0x04, 0x00, 0x00, 0x00, 0x02, 0x03, 0x81, 0x04, 0x03])
      const validFrame = buildV2Frame({
        payload,
        messageId: 0,
        crcExtra: HEARTBEAT_CRC_EXTRA,
        systemId: 1,
        componentId: 1,
        sequence: 0,
        signed: false,
        signature: null,
      })

      // Prepend garbage bytes
      const withGarbage = new Uint8Array(3 + validFrame.length)
      withGarbage.set([0x01, 0x02, 0x03]) // garbage
      withGarbage.set(validFrame, 3)

      const result = parseFrame(withGarbage, crcExtraTable)
      expect(result.frame).toBeDefined()
      expect(result.frame!.crc_ok).toBe(true)
    })

    it('should return offset consumed when v2 magic found but not enough header data', () => {
      // v2 needs at least 12 bytes from magic. Provide magic + 10 bytes (11 total < 12)
      const data = new Uint8Array([
        0x00, 0x00, 0xfd, 0x09, 0x00, 0x00, 0x00, 0x01, 0x01, 0x00, 0x00,
      ])
      const result = parseFrame(data, crcExtraTable)
      expect(result.frame).toBeUndefined()
      expect(result.bytesConsumed).toBe(2) // consumed garbage before magic, waiting for more data
    })

    it('should return offset consumed when v1 magic found but not enough header data', () => {
      const data = new Uint8Array([0x00, 0x00, 0xfe, 0x09, 0x00, 0x01, 0x01, 0x00])
      const result = parseFrame(data, crcExtraTable)
      // v1 needs 8 bytes min from magic, we have exactly 6 bytes after garbage
      // but payload extends beyond buffer
      expect(result.frame).toBeUndefined()
    })

    it('should return offset consumed when payload extends beyond buffer', () => {
      // Valid v2 header claiming 9-byte payload, but buffer is truncated
      const data = new Uint8Array([
        0xfd, // magic
        0x09, // payload length = 9
        0x00,
        0x00, // flags
        0x00,
        0x01,
        0x01, // seq, sysid, compid
        0x00,
        0x00,
        0x00, // msgid
        0x04,
        0x00, // only 2 bytes of payload (need 9 + 2 checksum)
      ])
      const result = parseFrame(data, crcExtraTable)
      expect(result.frame).toBeUndefined()
      expect(result.bytesConsumed).toBe(0) // waiting for more data
    })
  })

  describe('round-trip with createFrame', () => {
    it('should round-trip v2 frame through createFrame and parseFrame', () => {
      const payload = new Uint8Array([0x04, 0x00, 0x00, 0x00, 0x02, 0x03, 0x81, 0x04, 0x03])

      const frame = createFrame(0, payload, 1, 1, 42, HEARTBEAT_CRC_EXTRA, 2)
      const result = parseFrame(frame, crcExtraTable)

      expect(result.frame).toBeDefined()
      expect(result.frame!.crc_ok).toBe(true)
      expect(result.frame!.system_id).toBe(1)
      expect(result.frame!.component_id).toBe(1)
      expect(result.frame!.sequence).toBe(42)
      expect(result.frame!.message_id).toBe(0)
    })

    it('should round-trip v1 frame through createFrame and parseFrame', () => {
      const payload = new Uint8Array([0x04, 0x00, 0x00, 0x00, 0x02, 0x03, 0x81, 0x04, 0x03])

      const frame = createFrame(0, payload, 1, 1, 42, HEARTBEAT_CRC_EXTRA, 1)
      const result = parseFrame(frame, crcExtraTable)

      expect(result.frame).toBeDefined()
      expect(result.frame!.crc_ok).toBe(true)
      expect(result.frame!.protocol_version).toBe(1)
      expect(result.frame!.system_id).toBe(1)
      expect(result.frame!.component_id).toBe(1)
      expect(result.frame!.sequence).toBe(42)
      expect(result.frame!.message_id).toBe(0)
    })

    it('should auto-detect v1 for message IDs <= 255', () => {
      const payload = new Uint8Array([0x01])
      const frame = createFrame(0, payload, 1, 1, 0, HEARTBEAT_CRC_EXTRA)
      expect(frame[0]).toBe(0xfe) // v1 magic
    })

    it('should auto-detect v2 for message IDs > 255', () => {
      const payload = new Uint8Array([0x01])
      const frame = createFrame(300, payload, 1, 1, 0, 50)
      expect(frame[0]).toBe(0xfd) // v2 magic
    })
  })
})
