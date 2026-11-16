// The argument list whisper-cli is called with (research.md R6). A list, never a shell line: nothing in the hint or the
// paths is ever interpreted.
export interface WhisperArgs {
  model: string
  vad: string
  audio: string
  /** Where it writes `<outBase>.json`. */
  outBase: string
  hint: string
  threads: number
}

export const whisperArgs = ({ model, vad, audio, outBase, hint, threads }: WhisperArgs): string[] => [
  '-m',
  model,
  '-f',
  audio,
  '-l',
  'es',
  // Silero skips silence and music, where Whisper is known to make text up (R2).
  '--vad',
  '-vm',
  vad,
  // The full JSON brings each fragment with its times and its probability.
  '-ojf',
  '-of',
  outBase,
  '-pp',
  '-t',
  String(threads),
  ...(hint.trim() ? ['--prompt', hint] : []),
]
