// MAVLink CRC calculation using X.25 (MCRF4XX) algorithm
// This module is shared across all dialects

/**
 * Initial CRC value for X.25 algorithm
 */
export const X25_INIT_CRC = 0xffff

/**
 * MAVLink CRC calculator using X.25 (MCRF4XX) algorithm
 */
export class MAVLinkCRC {
  /**
   * Calculate CRC for MAVLink message data with CRC_EXTRA seed
   * @param data Message bytes (header + payload, excluding magic and checksum)
   * @param crcExtra CRC_EXTRA byte for the message type
   * @returns 16-bit CRC checksum
   */
  static calculate(data: Uint8Array, crcExtra: number): number {
    let crc = X25_INIT_CRC

    // Process all message bytes using MCRF4XX algorithm
    for (let i = 0; i < data.length; i++) {
      let tmp = data[i] ^ (crc & 0xff)
      tmp = (tmp ^ (tmp << 4)) & 0xff
      crc = ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xffff
    }

    // Add CRC_EXTRA byte using the same algorithm
    let tmp = crcExtra ^ (crc & 0xff)
    tmp = (tmp ^ (tmp << 4)) & 0xff
    crc = ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xffff

    return crc
  }

  /**
   * Validate a received MAVLink checksum
   * @param data Message bytes (header + payload, excluding magic and checksum)
   * @param crcExtra CRC_EXTRA byte for the message type
   * @param receivedChecksum The checksum from the received message
   * @returns true if checksum matches
   */
  static validate(data: Uint8Array, crcExtra: number, receivedChecksum: number): boolean {
    const calculatedChecksum = this.calculate(data, crcExtra)
    return calculatedChecksum === receivedChecksum
  }

  /**
   * Validate using CRC_EXTRA lookup table
   * @param data Message bytes
   * @param messageId Message ID to look up CRC_EXTRA
   * @param receivedChecksum The received checksum
   * @param crcExtraTable CRC_EXTRA lookup table for the dialect
   * @returns true if checksum matches, false if invalid or unknown message
   */
  static validateWithTable(
    data: Uint8Array,
    messageId: number,
    receivedChecksum: number,
    crcExtraTable: Record<number, number>
  ): boolean {
    const crcExtra = crcExtraTable[messageId]
    if (crcExtra === undefined) {
      return false
    }
    return this.validate(data, crcExtra, receivedChecksum)
  }
}
