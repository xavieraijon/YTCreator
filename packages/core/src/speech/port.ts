import type { HeardWord } from '../subtitles/model.ts'
import type { SpeechFailure } from './failures.ts'

// The domain only knows this port; the engine lives in packages/speech (research.md R6).
export interface RecognizeRequest {
  /** A WAV PCM 16 kHz mono file, already checked by the server. */
  audioPath: string
  language: 'es'
  /** Names, figures and terms of the script, so the engine spells them as written (R6). */
  hint: string
  /** One of `whisperModels` in installer/versions.json. */
  model: string
  signal: AbortSignal
  /** From 0 to 1, never going back. */
  onProgress(fraction: number): void
}

export type RecognizeResult =
  | { ok: true; words: HeardWord[]; /** How long it took, to measure this machine (R7). */ seconds: number }
  | { ok: false; failure: SpeechFailure }

export interface SpeechRecognizer {
  recognize(request: RecognizeRequest): Promise<RecognizeResult>
}
