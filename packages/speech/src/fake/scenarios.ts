import { type HeardWord, isSpeechFailure, type SpeechFailure } from '@ytcreator/core'

// What the fake recognizer «hears» in each test audio (contracts/speech-recognizer.md, «El falso»).
export const FAKE_SPEECH_SCENARIOS = ['hola', 'con-errores', 'improvisa', 'silencio'] as const
export type FakeSpeechScenario = (typeof FAKE_SPEECH_SCENARIOS)[number]

const words = (text: string, from: number, step: number, low: string[] = []): HeardWord[] =>
  text.split(' ').map((word, i) => ({
    text: word,
    start: Number((from + i * step).toFixed(3)),
    end: Number((from + i * step + step * 0.8).toFixed(3)),
    p: low.includes(word) ? 0.3 : 0.92,
  }))

// A function, not a constant: the published build must not keep these calls (the step «No fake speech»).
export const fakeSpeechWords = (scenario: FakeSpeechScenario): HeardWord[] =>
  ({
    hola: words('Hola, bienvenidos al canal. Hoy hacemos pan casero.', 0.2, 0.55),
    // Misheard terms of the script, with little confidence, for the alignment and the blocks.
    'con-errores': words('Hoy hacemos pan con masa madr y arina de fuersa, a 250 grados.', 0.2, 0.45, [
      'madr',
      'arina',
      'fuersa,',
    ]),
    // Words that are not in the script: the creator improvised.
    improvisa: words('Antes de empezar, un saludo a todos los que nos veis desde casa.', 0.2, 0.38),
    silencio: [],
  })[scenario]

/** `fallo-<código>.wav` gives that failure; the name of a scenario gives its words. */
export function scenarioOf(fileName: string): FakeSpeechScenario | { failure: SpeechFailure } | null {
  const base = fileName.replace(/\.wav$/i, '')
  const failure = /^fallo-(.+)$/.exec(base)?.[1]
  if (failure) return { failure: isSpeechFailure(failure) ? failure : 'interno' }
  return (FAKE_SPEECH_SCENARIOS as readonly string[]).includes(base) ? (base as FakeSpeechScenario) : null
}
