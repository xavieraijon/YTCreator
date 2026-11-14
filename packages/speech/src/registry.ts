import type { SpeechRecognizer } from '@ytcreator/core'
import { createFakeRecognizer } from './fake/fake-recognizer.ts'
import { scenarioOf } from './fake/scenarios.ts'

export interface SpeechRegistryOptions {
  env: Record<string, string | undefined>
  /** The real recognizer, built only when the fake is not on. */
  real: () => SpeechRecognizer
  // Only narrows what the build allows, like the AI and YouTube registries.
  allowFake?: boolean
  log?: (line: string) => void
}

// The fake switch works only in a build that allows fakes; then nothing runs the engine (decision 9).
export function createSpeechRecognizer({ env, real, allowFake = true, log }: SpeechRegistryOptions): {
  recognizer: SpeechRecognizer
  fake: boolean
} {
  if (__YTC_ALLOW_FAKE_AI__ && allowFake && env.YTCREATOR_FAKE_SPEECH) {
    const value = env.YTCREATOR_FAKE_SPEECH
    // A typo fails loudly, as with the fake AI: never a scenario nobody asked for.
    if (value !== '1' && !scenarioOf(`${value}.wav`))
      throw new Error(`YTCREATOR_FAKE_SPEECH no válido: «${value}». Usa 1, un escenario o fallo-<código>.`)
    const recognizer = createFakeRecognizer({
      scenario: value === '1' ? 'hola' : value,
      // The e2e slows it down to reload in the middle (decision 26).
      stepMs: Number(env.YTCREATOR_FAKE_SPEECH_STEP_MS) || 200,
      ...(log ? { log } : {}),
    })
    return { recognizer, fake: true }
  }
  return { recognizer: real(), fake: false }
}
