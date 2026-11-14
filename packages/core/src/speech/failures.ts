// What can go wrong while listening to the audio (specs/007-subtitles/contracts/speech-recognizer.md).
export const SPEECH_FAILURES = [
  'sin_motor',
  'sin_modelo',
  'audio_no_valido',
  'sin_memoria',
  'interrumpido',
  'interno',
] as const
export type SpeechFailure = (typeof SPEECH_FAILURES)[number]

export const isSpeechFailure = (value: unknown): value is SpeechFailure =>
  typeof value === 'string' && (SPEECH_FAILURES as readonly string[]).includes(value)
