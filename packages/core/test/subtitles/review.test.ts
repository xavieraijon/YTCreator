import { describe, expect, it } from 'vitest'
import type { Cue } from '../../src/subtitles/model.ts'
import { REVIEW_BATCH, reviewBatches, reviewOutput, reviewOutputFor } from '../../src/subtitles/review.ts'

const cue = (id: string, text: string): Cue => ({
  id,
  start: 0,
  end: 1,
  text,
  flags: [],
  heard: null,
  reviewed: false,
})

const BATCH = [
  { id: 'c1', text: 'hoy hacemos pan casero' },
  { id: 'c2', text: 'con masa madre y harina de fuerza' },
  { id: 'c3', text: 'lo explica el canal pan casero' },
]
const SCRIPT = 'Hoy hacemos pan casero. Con masa madre y harina de fuerza. Lo explica el canal Pan Casero.'
const schema = (maxLines = 2) => reviewOutputFor({ batch: BATCH, script: SCRIPT, maxLines })

const change = (id: string, text: string, reason = 'falta el punto final') => ({ id, text, reason })
const reasons = (value: unknown, maxLines = 2) => {
  const parsed = schema(maxLines).safeParse(value)
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message)
}

describe('the output of revision_subtitulos (R11, contracts/ai-uses.md)', () => {
  it('takes changes of punctuation and capitals', () => {
    const value = {
      changes: [
        change('c1', 'Hoy hacemos pan casero.'),
        change('c3', 'Lo explica el canal Pan Casero.', 'nombre propio con mayúscula'),
      ],
    }
    expect(reasons(value)).toEqual([])
    expect(reasons({ changes: [] })).toEqual([])
  })

  it('refuses an id that is not in the batch, or one twice', () => {
    expect(reasons({ changes: [change('c9', 'Algo.')] })).toContain('id_desconocido')
    expect(
      reasons({ changes: [change('c1', 'Hoy hacemos pan casero.'), change('c1', 'Hoy, hacemos pan casero.')] }),
    ).toContain('repetido')
  })

  it('refuses an empty text or the same one', () => {
    expect(reasons({ changes: [change('c1', '  ')] })).toContain('vacio')
    expect(reasons({ changes: [change('c1', 'hoy hacemos pan casero')] })).toContain('igual')
  })

  it('refuses a rewrite: over 30 % of edit distance', () => {
    expect(reasons({ changes: [change('c1', 'Hoy cocinamos un bizcocho')] })).toContain('distancia')
  })

  it('refuses a word that is neither in the text nor in the script, but not one with other capitals or accents', () => {
    expect(reasons({ changes: [change('c2', 'con masa madre y harina de trigo')] })).toContain('palabra_nueva')
    // «Fuerza», «hárina»: the same words with other capitals or accents.
    expect(reasons({ changes: [change('c2', 'Con masa madre y hárina de Fuerza.')] })).toEqual([])
  })

  it('a short subtitle may change only its capitals, accents or signs, whatever the 30 % says', () => {
    const short = reviewOutputFor({
      batch: [
        { id: 'c1', text: 'si' },
        { id: 'c2', text: 'que' },
      ],
      script: '',
      maxLines: 2,
    })
    expect(short.safeParse({ changes: [change('c1', 'Sí.'), change('c2', '¿Qué?')] }).success).toBe(true)
  })

  it("never changes a figure that was said, even for the script's one", () => {
    const batch = [{ id: 'c1', text: 'lo horneamos a 200 grados' }]
    const figures = reviewOutputFor({ batch, script: 'Lo horneamos a 250 grados.', maxLines: 2 })
    const parsed = figures.safeParse({ changes: [change('c1', 'Lo horneamos a 250 grados.')] })
    expect(parsed.success ? [] : parsed.error.issues.map((issue) => issue.message)).toContain('cifra')
    expect(figures.safeParse({ changes: [change('c1', 'Lo horneamos a 200 grados.')] }).success).toBe(true)
  })

  it('the words of the glossary are known too', () => {
    const batch = [{ id: 'c1', text: 'juanma dice hola' }]
    const glossary = reviewOutputFor({ batch, script: '', maxLines: 2, glossary: ['Xuanma'] })
    expect(glossary.safeParse({ changes: [change('c1', 'Xuanma dice hola.')] }).success).toBe(true)
  })

  it('refuses a text longer than a subtitle can be', () => {
    const batch = [{ id: 'c1', text: 'a'.repeat(299) }]
    const long = reviewOutputFor({ batch, script: '', maxLines: 2 })
    expect(long.safeParse({ changes: [change('c1', `${'a'.repeat(299)}..`)] }).success).toBe(false)
  })

  it('refuses more lines than its format allows', () => {
    expect(reasons({ changes: [change('c1', 'Hoy hacemos\npan casero.')] }, 1)).toContain('lineas')
    expect(reasons({ changes: [change('c1', 'Hoy hacemos\npan casero.')] }, 2)).toEqual([])
  })

  it('a reason is plain and short', () => {
    expect(reviewOutput.safeParse({ changes: [change('c1', 'Hoy.', 'x'.repeat(121))] }).success).toBe(false)
  })
})

describe('the batches of a long video', () => {
  it('sends up to 200 cues at a time, with their id and text only', () => {
    const cues = Array.from({ length: 450 }, (_, i) => cue(`c${i + 1}`, `texto ${i + 1}`))
    const batches = reviewBatches(cues)
    expect(REVIEW_BATCH).toBe(200)
    expect(batches.map((batch) => batch.length)).toEqual([200, 200, 50])
    expect(batches[2]![0]).toEqual({ id: 'c401', text: 'texto 401' })
  })
})
