// MAVLink frame parsing - extracts frames from raw bytes
import { MAVLinkFrame } from './types';
import { MAVLinkCRC } from './crc';

/**
 * MAVLink protocol magic bytes
 */
export const MAVLINK_V1_MAGIC = 0xfe;
export const MAVLINK_V2_MAGIC = 0xfd;

/**
 * Minimum frame sizes
 */
export const MAVLINK_V1_HEADER_SIZE = 6; // magic(1) + len(1) + seq(1) + sysid(1) + compid(1) + msgid(1)
export const MAVLINK_V2_HEADER_SIZE = 10; // magic(1) + len(1) + incompat(1) + compat(1) + seq(1) + sysid(1) + compid(1) + msgid(3)
export const MAVLINK_CHECKSUM_SIZE = 2;
export const MAVLINK_SIGNATURE_SIZE = 13;

/**
 * Result of attempting to parse a frame
 */
export interface FrameParseResult {
  frame?: MAVLinkFrame;
  bytesConsumed: number;
}

/**
 * Parse a single MAVLink frame from a byte buffer
 * @param data Raw bytes to parse
 * @param crcExtraTable CRC_EXTRA lookup table for checksum validation
 * @returns Frame if found, plus number of bytes consumed
 */
export function parseFrame(
  data: Uint8Array,
  crcExtraTable: Record<number, number>
): FrameParseResult {
  if (data.length < 8) {
    return { bytesConsumed: 0 };
  }

  let offset = 0;

  // Find magic byte
  while (offset < data.length && data[offset] !== MAVLINK_V1_MAGIC && data[offset] !== MAVLINK_V2_MAGIC) {
    offset++;
  }

  if (offset === data.length) {
    return { bytesConsumed: data.length };
  }

  const magic = data[offset];
  const isV2 = magic === MAVLINK_V2_MAGIC;

  if (data.length - offset < (isV2 ? 12 : 8)) {
    return { bytesConsumed: offset };
  }

  let frameOffset = offset;
  const frame: Partial<MAVLinkFrame> = { magic };

  frameOffset++;
  frame.length = data[frameOffset++];

  if (isV2) {
    frame.incompatible_flags = data[frameOffset++];
    frame.compatible_flags = data[frameOffset++];
  }

  frame.sequence = data[frameOffset++];
  frame.system_id = data[frameOffset++];
  frame.component_id = data[frameOffset++];
  frame.message_id = data[frameOffset++];

  if (isV2 && data.length - frameOffset >= 2) {
    frame.message_id |= data[frameOffset++] << 8;
    frame.message_id |= data[frameOffset++] << 16;
  }

  const totalLength = frameOffset - offset + frame.length + 2; // +2 for checksum
  if (data.length - offset < totalLength) {
    return { bytesConsumed: offset };
  }

  frame.payload = data.slice(frameOffset, frameOffset + frame.length);
  frameOffset += frame.length;

  frame.checksum = data[frameOffset] | (data[frameOffset + 1] << 8);
  frameOffset += 2;

  // Handle signature for v2
  if (isV2 && frame.incompatible_flags && (frame.incompatible_flags & 0x01)) {
    if (data.length - frameOffset >= MAVLINK_SIGNATURE_SIZE) {
      frame.signature = data.slice(frameOffset, frameOffset + MAVLINK_SIGNATURE_SIZE);
      frameOffset += MAVLINK_SIGNATURE_SIZE;
    }
  }

  // Validate CRC
  const headerAndPayload = data.slice(offset + 1, offset + frameOffset - offset - 2);
  frame.crc_ok = MAVLinkCRC.validateWithTable(
    headerAndPayload,
    frame.message_id,
    frame.checksum,
    crcExtraTable
  );
  frame.protocol_version = isV2 ? 2 : 1;

  return { frame: frame as MAVLinkFrame, bytesConsumed: frameOffset - offset };
}

/**
 * Create a MAVLink v1 or v2 frame from message data
 * @param messageId Message ID
 * @param payload Serialized payload bytes
 * @param systemId System ID (default: 1)
 * @param componentId Component ID (default: 1)
 * @param sequence Sequence number (default: 0)
 * @param crcExtra CRC_EXTRA for this message type
 * @param protocolVersion Protocol version (1 or 2, auto-detected if not specified)
 * @returns Complete MAVLink frame as bytes
 */
export function createFrame(
  messageId: number,
  payload: Uint8Array,
  systemId: number,
  componentId: number,
  sequence: number,
  crcExtra: number,
  protocolVersion?: 1 | 2
): Uint8Array {
  // Auto-detect protocol version based on message ID
  const needsV2 = messageId > 255;
  const version = protocolVersion ?? (needsV2 ? 2 : 1);
  const isV2 = version === 2;
  const magic = isV2 ? MAVLINK_V2_MAGIC : MAVLINK_V1_MAGIC;

  const headerSize = isV2 ? MAVLINK_V2_HEADER_SIZE : MAVLINK_V1_HEADER_SIZE;
  const frameSize = headerSize + payload.length + MAVLINK_CHECKSUM_SIZE;
  const buffer = new ArrayBuffer(frameSize);
  const view = new DataView(buffer);

  let offset = 0;

  // Header
  view.setUint8(offset++, magic);
  view.setUint8(offset++, payload.length);

  if (isV2) {
    view.setUint8(offset++, 0); // incompat_flags
    view.setUint8(offset++, 0); // compat_flags
    view.setUint8(offset++, sequence);
    view.setUint8(offset++, systemId);
    view.setUint8(offset++, componentId);
    // 24-bit message ID
    view.setUint8(offset++, messageId & 0xff);
    view.setUint8(offset++, (messageId >> 8) & 0xff);
    view.setUint8(offset++, (messageId >> 16) & 0xff);
  } else {
    view.setUint8(offset++, sequence);
    view.setUint8(offset++, systemId);
    view.setUint8(offset++, componentId);
    view.setUint8(offset++, messageId & 0xff);
  }

  // Payload
  const payloadView = new Uint8Array(buffer, offset, payload.length);
  payloadView.set(payload);
  offset += payload.length;

  // Calculate CRC
  const messageData = new Uint8Array(buffer, 1, offset - 1);
  const checksum = MAVLinkCRC.calculate(messageData, crcExtra);

  // Checksum (little endian)
  view.setUint8(offset++, checksum & 0xff);
  view.setUint8(offset++, (checksum >> 8) & 0xff);

  return new Uint8Array(buffer);
}
