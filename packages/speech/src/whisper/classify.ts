import type { SpeechFailure } from '@ytcreator/core'
import type { WhisperRun } from './process.ts'

const NO_MODEL = [/failed to load model/i, /failed to initialize whisper context/i, /failed to open .*model/i]
const BAD_AUDIO = [
  /failed to read audio/i,
  /failed to open .*audio/i,
  /error: input file not found/i,
  /failed to read WAV/i,
]
const NO_MEMORY = [/out of memory/i, /failed to allocate/i, /bad_alloc/i, /ggml_.*alloc.*failed/i]

// A finished run as a failure of the port, or null when it ended well. The creator never sees whisper's text.
export function classifyWhisperRun(run: WhisperRun): SpeechFailure | null {
  if (run.aborted) return 'interrumpido'
  if (run.spawnError) return 'sin_motor'
  if (run.exitCode === 0) return null
  if (NO_MEMORY.some((re) => re.test(run.stderr))) return 'sin_memoria'
  // Killed from outside without us stopping it: on Linux, the system ran out of memory.
  if (run.signal === 'SIGKILL') return 'sin_memoria'
  if (NO_MODEL.some((re) => re.test(run.stderr))) return 'sin_modelo'
  if (BAD_AUDIO.some((re) => re.test(run.stderr))) return 'audio_no_valido'
  return 'interno'
}
