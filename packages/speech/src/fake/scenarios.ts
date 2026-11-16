import { type HeardWord, isSpeechFailure, type SpeechFailure } from '@ytcreator/core'

// What the fake recognizer «hears» in each test audio (contracts/speech-recognizer.md, «El falso»).
export const FAKE_SPEECH_SCENARIOS = ['hola', 'con-errores', 'improvisa', 'silencio', 'capitulos'] as const
export type FakeSpeechScenario = (typeof FAKE_SPEECH_SCENARIOS)[number]

const words = (text: string, from: number, step: number, low: string[] = []): HeardWord[] =>
  text.split(' ').map((word, i) => ({
    text: word,
    start: Number((from + i * step).toFixed(3)),
    end: Number((from + i * step + step * 0.8).toFixed(3)),
    p: low.includes(word) ? 0.3 : 0.92,
  }))

// Sentences said one after another, `pause` seconds of silence before the one at `pauseBefore`.
const sentences = (texts: readonly string[], pauseBefore: number, pause: number): HeardWord[] => {
  const heard: HeardWord[] = []
  let clock = 0.2
  texts.forEach((text, index) => {
    if (index === pauseBefore) clock += pause
    const said = words(text, clock, 0.4)
    heard.push(...said)
    clock = said.at(-1)!.end + 0.6
  })
  return heard
}

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
    // The five blocks of a script, the third one 40 s later than the script says: an edit with a pause (007, US3).
    capitulos: sentences(
      [
        'Hoy te enseño el error que comete casi todo el mundo cuando hace pan en casa y por qué la miga le sale tan densa, tan pesada y tan triste cada vez.',
        'Pasa porque la harina del supermercado tiene muy poca fuerza y el agua fría frena a la levadura durante las primeras horas de reposo encima de la encimera.',
        'Lo primero que hay que cambiar es la temperatura del agua: tibia y nunca caliente, con una cucharada de miel para despertar a la masa madre que lleva días dormida.',
        'El paso que marca la diferencia es plegar la masa cuatro veces, una cada media hora y sin amasar, para que la red de gluten se forme sola y muy despacio.',
        'Mañana prueba con medio kilo de harina de fuerza, hornéalo a doscientos cincuenta grados con un poco de vapor y cuéntame en los comentarios cómo te ha quedado.',
      ],
      2,
      40,
    ),
  })[scenario]

/** `fallo-<código>.wav` gives that failure; the name of a scenario gives its words. */
export function scenarioOf(fileName: string): FakeSpeechScenario | { failure: SpeechFailure } | null {
  const base = fileName.replace(/\.wav$/i, '')
  const failure = /^fallo-(.+)$/.exec(base)?.[1]
  if (failure) return { failure: isSpeechFailure(failure) ? failure : 'interno' }
  return (FAKE_SPEECH_SCENARIOS as readonly string[]).includes(base) ? (base as FakeSpeechScenario) : null
}
