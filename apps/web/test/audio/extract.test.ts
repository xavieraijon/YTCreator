import { describe, expect, it } from 'vitest'
import { extractAudio, failureOf, wavSeconds } from '../../src/audio/extract.ts'

function wav(seconds: number, { rate = 16_000, format = 1 } = {}) {
  const data = Math.round(seconds * rate) * 2
  const bytes = new ArrayBuffer(44 + data)
  const view = new DataView(bytes)
  const write = (at: number, text: string) => [...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)))
  write(0, 'RIFF')
  view.setUint32(4, 36 + data, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, format, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, data, true)
  return bytes
}

describe('the header of the WAV it makes', () => {
  it('gives its length in seconds', () => {
    expect(wavSeconds(wav(2.5))).toBeCloseTo(2.5, 5)
  })

  it('is not a WAV PCM: null', () => {
    expect(wavSeconds(new TextEncoder().encode('no es audio').buffer as ArrayBuffer)).toBeNull()
    expect(wavSeconds(wav(1, { format: 3 }))).toBeNull()
  })
})

describe('what a failure means for the creator', () => {
  it('stopping is «cancelado»', () => {
    expect(failureOf(new DOMException('stop', 'AbortError'))).toBe('cancelado')
    expect(failureOf({ name: 'ConversionCanceledError', message: 'Conversion has been canceled.' })).toBe('cancelado')
  })

  it('a file the browser cannot read is «no_se_puede_leer»', () => {
    expect(failureOf(new Error('Input has an unsupported or unrecognizable format.'))).toBe('no_se_puede_leer')
    expect(failureOf(new Error('Failed to decode audio data'))).toBe('no_se_puede_leer')
  })

  it('anything else is «interno»', () => {
    expect(failureOf(new Error('boom'))).toBe('interno')
    expect(failureOf(null)).toBe('interno')
  })

  it('a stop asked before starting does not even open the file', async () => {
    const controller = new AbortController()
    controller.abort()
    expect(await extractAudio(new Blob(['x']), { signal: controller.signal })).toEqual({
      ok: false,
      failure: 'cancelado',
    })
  })
})
