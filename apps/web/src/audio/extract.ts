// The audio of the chosen video, taken out in the browser as WAV PCM 16 kHz mono (research.md R3, decision 4): the
// video never leaves the creator's machine, and only the audio is uploaded. mediabunny is loaded only when needed.

export const AUDIO_RATE = 16_000
// Three hours, as the server (R4).
export const MAX_AUDIO_SECONDS = 3 * 60 * 60

/** Why the audio could not be taken out, as the screen explains it. */
export type ExtractFailure = 'no_se_puede_leer' | 'sin_sonido' | 'demasiado_largo' | 'cancelado' | 'interno'

export type ExtractResult = { ok: true; wav: Blob; seconds: number } | { ok: false; failure: ExtractFailure }

export interface ExtractOptions {
  /** From 0 to 1, never going back. */
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

/** The length of a WAV PCM from its header, or null when it is not one. */
export function wavSeconds(bytes: ArrayBuffer): number | null {
  const view = new DataView(bytes)
  const text = (at: number) => String.fromCharCode(...new Uint8Array(bytes, at, 4))
  if (bytes.byteLength < 12 || text(0) !== 'RIFF' || text(8) !== 'WAVE') return null
  let byteRate = 0
  let at = 12
  while (at + 8 <= bytes.byteLength) {
    const id = text(at)
    const length = view.getUint32(at + 4, true)
    if (id === 'fmt ' && at + 16 <= bytes.byteLength) {
      if (view.getUint16(at + 8, true) !== 1) return null
      byteRate = view.getUint32(at + 16, true)
    }
    if (id === 'data') return byteRate > 0 ? Math.min(length, bytes.byteLength - at - 8) / byteRate : null
    at += 8 + length + (length % 2)
  }
  return null
}

/** What an error of the browser or of mediabunny means for the creator. */
export function failureOf(error: unknown): ExtractFailure {
  const name = (error as { name?: unknown } | null)?.name
  const message = String((error as { message?: unknown } | null)?.message ?? error ?? '')
  if (name === 'AbortError' || name === 'ConversionCanceledError' || /cancel/i.test(message)) return 'cancelado'
  if (/unsupported|not supported|unknown format|unrecognized|could not (?:read|decode)|decod/i.test(message))
    return 'no_se_puede_leer'
  return 'interno'
}

export async function extractAudio(file: Blob, { onProgress, signal }: ExtractOptions = {}): Promise<ExtractResult> {
  if (signal?.aborted) return { ok: false, failure: 'cancelado' }
  let last = 0
  const report = (fraction: number) => {
    const value = Math.min(1, Math.max(last, fraction))
    if (value > last) {
      last = value
      onProgress?.(value)
    }
  }
  try {
    const { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Output, WavOutputFormat } =
      await import('mediabunny')
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
    const track = await input.getPrimaryAudioTrack()
    if (!track) return { ok: false, failure: 'sin_sonido' }
    if (!(await track.canDecode())) return { ok: false, failure: 'no_se_puede_leer' }
    const duration = await input.computeDuration()
    if (duration > MAX_AUDIO_SECONDS) return { ok: false, failure: 'demasiado_largo' }

    const target = new BufferTarget()
    const output = new Output({ format: new WavOutputFormat(), target })
    const conversion = await Conversion.init({
      input,
      output,
      video: { discard: true },
      audio: { numberOfChannels: 1, sampleRate: AUDIO_RATE, codec: 'pcm-s16', forceTranscode: true },
      showWarnings: false,
    })
    if (!conversion.isValid) return { ok: false, failure: 'no_se_puede_leer' }
    conversion.onProgress = (progress) => report(Math.min(0.99, progress))
    const stop = () => void conversion.cancel()
    signal?.addEventListener('abort', stop, { once: true })
    try {
      await conversion.execute()
    } finally {
      signal?.removeEventListener('abort', stop)
    }
    const buffer = target.buffer
    const seconds = buffer ? wavSeconds(buffer) : null
    if (!buffer || seconds === null || seconds <= 0) return { ok: false, failure: 'sin_sonido' }
    report(1)
    return { ok: true, wav: new Blob([buffer], { type: 'audio/wav' }), seconds }
  } catch (error) {
    if (signal?.aborted) return { ok: false, failure: 'cancelado' }
    return { ok: false, failure: failureOf(error) }
  }
}
