// Ring buffer for efficient streaming - avoids repeated array allocations
const DEFAULT_BUFFER_SIZE = 4096

/**
 * Ring buffer implementation for efficient byte stream processing.
 * Avoids repeated array allocations by reusing a fixed buffer.
 */
export class StreamBuffer {
  private buffer: Uint8Array
  private bufferStart = 0
  private bufferEnd = 0

  constructor(initialSize: number = DEFAULT_BUFFER_SIZE) {
    this.buffer = new Uint8Array(initialSize)
  }

  /**
   * Append data to the buffer, growing if necessary
   */
  append(data: Uint8Array): void {
    const currentLength = this.bufferEnd - this.bufferStart
    const requiredSize = currentLength + data.length

    // Grow buffer if needed
    if (requiredSize > this.buffer.length) {
      const newSize = Math.max(this.buffer.length * 2, requiredSize)
      const newBuffer = new Uint8Array(newSize)
      newBuffer.set(this.getContents())
      this.buffer = newBuffer
      this.bufferStart = 0
      this.bufferEnd = currentLength
    } else if (this.bufferEnd + data.length > this.buffer.length) {
      // Compact: move data to start of buffer
      const contents = this.getContents()
      this.buffer.set(contents)
      this.bufferStart = 0
      this.bufferEnd = currentLength
    }

    this.buffer.set(data, this.bufferEnd)
    this.bufferEnd += data.length
  }

  /**
   * Get current buffer contents as a view
   */
  getContents(): Uint8Array {
    return this.buffer.subarray(this.bufferStart, this.bufferEnd)
  }

  /**
   * Consume bytes from the start of the buffer
   */
  consume(bytes: number): void {
    this.bufferStart += bytes
    if (this.bufferStart === this.bufferEnd) {
      this.bufferStart = 0
      this.bufferEnd = 0
    }
  }

  /**
   * Clear the buffer
   */
  reset(): void {
    this.bufferStart = 0
    this.bufferEnd = 0
  }

  /**
   * Get current buffer length
   */
  get length(): number {
    return this.bufferEnd - this.bufferStart
  }
}
