import { open } from 'node:fs/promises'

export interface WavInfo {
  sampleRate: number
  channels: number
  bitsPerSample: number
  seconds: number
}

const HEADER_BYTES = 4096

/**
 * Reads the header of a PCM WAV file, walking its chunks to the data (some tools put others before it).
 * Returns null when it is not one.
 */
export async function readWavInfo(path: string): Promise<WavInfo | null> {
  let handle
  try {
    handle = await open(path, 'r')
  } catch {
    return null
  }
  try {
    const buffer = Buffer.alloc(HEADER_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, HEADER_BYTES, 0)
    const size = (await handle.stat()).size
    if (bytesRead < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE')
      return null
    let format: Omit<WavInfo, 'seconds'> | null = null
    let at = 12
    while (at + 8 <= bytesRead) {
      const id = buffer.toString('ascii', at, at + 4)
      const length = buffer.readUInt32LE(at + 4)
      if (id === 'fmt ' && at + 24 <= bytesRead) {
        // 1 is plain PCM.
        if (buffer.readUInt16LE(at + 8) !== 1) return null
        format = {
          channels: buffer.readUInt16LE(at + 10),
          sampleRate: buffer.readUInt32LE(at + 12),
          bitsPerSample: buffer.readUInt16LE(at + 22),
        }
      }
      if (id === 'data') {
        if (!format || format.sampleRate === 0 || format.channels === 0 || format.bitsPerSample === 0) return null
        const bytes = Math.min(length, size - at - 8)
        const seconds = bytes / (format.sampleRate * format.channels * (format.bitsPerSample / 8))
        return { ...format, seconds }
      }
      at += 8 + length + (length % 2)
    }
    return null
  } finally {
    await handle.close()
  }
}
