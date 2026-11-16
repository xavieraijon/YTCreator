import { describe, expect, it } from 'vitest'
import { align, blockStarts, normalizeWord, spanishNumber } from '../../src/subtitles/align.ts'
import type { HeardWord } from '../../src/subtitles/model.ts'

/** Heard words at a steady pace, with a probability for each one. */
const heard = (text: string, p = 0.9): HeardWord[] =>
  text.split(' ').map((word, i) => ({ text: word, start: i * 0.4, end: i * 0.4 + 0.35, p }))
const texts = (words: { text: string }[]) => words.map((word) => word.text).join(' ')
const changed = (words: { text: string; heard: string | null }[]) =>
  words.filter((word) => word.heard !== null).map((word) => [word.heard, word.text])

describe('normalizing a word to compare it', () => {
  it('lowercase, without accents or signs, numbers as digits', () => {
    expect(normalizeWord('¡Canción!')).toBe('cancion')
    expect(normalizeWord('Veinte,')).toBe('20')
    expect(normalizeWord('20.')).toBe('20')
    expect(normalizeWord('1.000')).toBe('1000')
  })

  it('reads numbers written with words', () => {
    expect(spanishNumber(['doscientos', 'cincuenta'])).toBe(250)
    expect(spanishNumber(['treinta', 'y', 'cinco'])).toBe(35)
    expect(spanishNumber(['veintitrés'])).toBe(23)
    expect(spanishNumber(['dos', 'mil', 'veinticuatro'])).toBe(2024)
    expect(spanishNumber(['cien'])).toBe(100)
    expect(spanishNumber(['ciento', 'uno'])).toBe(101)
    expect(spanishNumber(['pan'])).toBeNull()
  })
})

describe('correcting the heard words with the script (R9)', () => {
  it('a misheard proper name is written as in the script and keeps what was heard', () => {
    const result = align(heard('Hoy viene Fernandes a la cocina.'), 'Hoy viene Fernández a la cocina.')
    expect(texts(result)).toBe('Hoy viene Fernández a la cocina.')
    expect(changed(result)).toEqual([['Fernandes', 'Fernández']])
  })

  it('«veinte» against «20», and the other way round', () => {
    const toDigits = align(heard('Lo dejamos veinte minutos.'), 'Lo dejamos 20 minutos.')
    expect(texts(toDigits)).toBe('Lo dejamos 20 minutos.')
    expect(changed(toDigits)).toEqual([['veinte', '20']])
    const toWords = align(heard('Lo dejamos 20 minutos.'), 'Lo dejamos veinte minutos.')
    expect(texts(toWords)).toBe('Lo dejamos veinte minutos.')
  })

  it('a number said in two words against its digits', () => {
    const result = align(heard('Al horno a doscientos cincuenta grados.'), 'Al horno a 250 grados.')
    expect(texts(result)).toBe('Al horno a 250 grados.')
    expect(changed(result)).toEqual([['doscientos cincuenta', '250']])
  })

  it('up to 3 alike words changed together', () => {
    const result = align(heard('con masa madr y arina de fuersa.'), 'con masa madre y harina de fuerza.')
    expect(texts(result)).toBe('con masa madre y harina de fuerza.')
    expect(changed(result).map(([from]) => from)).toEqual(['madr', 'arina', 'fuersa.'])
  })

  it('an improvised sentence the script does not have stays as it was said', () => {
    const said = 'Hoy hacemos pan. Antes de nada, un saludo a todos los que nos veis desde casa. Necesitas harina.'
    const result = align(heard(said), 'Hoy hacemos pan. Necesitas harina.')
    expect(texts(result)).toBe(said)
    expect(changed(result)).toEqual([])
  })

  it('a sentence of the script that was not said is never added', () => {
    const said = 'Hoy hacemos pan. Necesitas harina.'
    const result = align(heard(said), 'Hoy hacemos pan. Es más fácil de lo que parece. Necesitas harina.')
    expect(texts(result)).toBe(said)
    expect(changed(result)).toEqual([])
  })

  it('something said differently, not misheard, is left alone', () => {
    const result = align(heard('Ahora lo metemos en la nevera.'), 'Ahora lo dejamos reposar en la encimera.')
    expect(changed(result)).toEqual([])
    expect(texts(result)).toBe('Ahora lo metemos en la nevera.')
  })

  it('alike words in another place are not touched', () => {
    const result = align(heard('La harina primero. Luego el agua.'), 'Luego el agua. La harina primero.')
    expect(changed(result)).toEqual([])
  })

  it('keeps the times, the probability and the punctuation of what was heard', () => {
    const words = heard('Hoy viene Fernandes, y cocina.')
    const result = align(words, 'Hoy viene Fernández y cocina.')
    expect(result[2]).toMatchObject({
      text: 'Fernández,',
      heard: 'Fernandes,',
      start: words[2]!.start,
      end: words[2]!.end,
    })
    expect(result.map((word) => word.start)).toEqual(words.map((word) => word.start))
  })

  it('a word that only changes case or punctuation stays as heard', () => {
    const result = align(heard('hoy hacemos pan'), 'Hoy hacemos pan.')
    expect(changed(result)).toEqual([])
  })

  it('without a script, nothing changes', () => {
    const words = heard('Hoy hacemos pan.')
    expect(changed(align(words, ''))).toEqual([])
  })

  it('aligns an hour of audio in under 2 seconds (SC-004)', () => {
    const sentence = 'Hoy vamos a hacer un pan casero sin amasar con harina de fuerza agua y sal'.split(' ')
    const script: string[] = []
    for (let i = 0; i < 9000; i++) script.push(i % 97 === 0 ? `Nombre${i}` : sentence[i % sentence.length]!)
    const said = script.map((word, i) => (i % 97 === 0 ? `${word}x` : word))
    // Some improvised words here and there, and some of the script not said.
    for (let i = said.length - 50; i > 0; i -= 700) said.splice(i, 0, 'bueno', 'pues', 'nada')
    for (let i = 300; i < said.length; i += 900) said.splice(i, 5)
    const began = performance.now()
    const result = align(heard(said.join(' ')), script.join(' '))
    expect(performance.now() - began).toBeLessThan(2000)
    expect(result).toHaveLength(said.length)
    expect(changed(result).length).toBeGreaterThan(80)
  })
})

// Words said one after another from `from`, at 0.4 s each.
const said = (text: string, from: number): HeardWord[] =>
  text.split(' ').map((word, i) => ({ text: word, start: from + i * 0.4, end: from + i * 0.4 + 0.35, p: 0.9 }))

const BLOCKS = [
  { id: 'b1', text: 'Hoy hacemos pan con masa madre en casa.' },
  { id: 'b2', text: 'Primero mezclamos la harina con el agua y la sal.' },
  { id: 'b3', text: 'Después lo dejamos reposar toda la noche en la nevera.' },
]

describe('where each block of the script starts in the audio (R13)', () => {
  it('at the first aligned word of each block, within 2 s (SC-005)', () => {
    const words = [
      ...said('Hola a todos.', 0),
      ...said('Hoy hacemos pan con masa madre en casa.', 2),
      ...said('Primero mezclamos la harina con el agua y la sal.', 8),
      ...said('Un momento que se me cae.', 14),
      // 40 s later than it would have been.
      ...said('Después lo dejamos reposar toda la noche en la nevera.', 56),
    ]
    const starts = blockStarts(words, BLOCKS)
    expect(starts.map((one) => one.blockId)).toEqual(['b1', 'b2', 'b3'])
    expect(starts[0]!.seconds).toBeCloseTo(2, 1)
    expect(starts[1]!.seconds).toBeCloseTo(8, 1)
    expect(starts[2]!.seconds).toBeCloseTo(56, 1)
  })

  it('heard wrong here and there is still found', () => {
    const words = [
      ...said('Hoy hacemos pan con masa madr en casa.', 1),
      ...said('Primero mezclamos la arina con el agua y la sal.', 6.5),
    ]
    const [first, second] = blockStarts(words, BLOCKS.slice(0, 2))
    expect(first!.seconds).toBeCloseTo(1, 1)
    expect(second!.seconds).toBeCloseTo(6.5, 1)
  })

  it('«no encontrado» if under 30 % of its words are aligned: cut in the edit', () => {
    const words = [
      ...said('Hoy hacemos pan con masa madre en casa.', 0),
      ...said('Después lo dejamos reposar toda la noche en la nevera.', 5),
    ]
    const starts = blockStarts(words, BLOCKS)
    expect(starts[1]).toMatchObject({ blockId: 'b2', seconds: null })
    expect(starts[2]!.seconds).toBeCloseTo(5, 1)
  })

  it('blocks put in another order in the edit are each found where they are', () => {
    const words = [
      ...said('Después lo dejamos reposar toda la noche en la nevera.', 0),
      ...said('Hoy hacemos pan con masa madre en casa.', 10),
      ...said('Primero mezclamos la harina con el agua y la sal.', 20),
    ]
    const starts = blockStarts(words, BLOCKS)
    expect(starts.map((one) => one.seconds)).toEqual([
      expect.closeTo(10, 1),
      expect.closeTo(20, 1),
      expect.closeTo(0, 1),
    ])
  })

  it('a few words of a block said in another one are not its start', () => {
    // «la harina» appears early, inside another sentence; the block itself comes later.
    const words = [
      ...said('Hoy hacemos pan con masa madre en casa y la harina importa.', 0),
      ...said('Primero mezclamos la harina con el agua y la sal.', 30),
    ]
    expect(blockStarts(words, BLOCKS.slice(0, 2))[1]!.seconds).toBeCloseTo(30, 1)
  })

  it('two blocks with the same sentences each take their own place', () => {
    const same = [
      { id: 'x', text: 'Esto es lo que dirías en el gancho. Esta parte sale del guion.' },
      { id: 'y', text: 'Esto es lo que dirías en el cierre. Esta parte sale del guion.' },
    ]
    const words = [
      ...said('Esto es lo que dirías en el gancho. Esta parte sale del guion.', 0),
      ...said('Esto es lo que dirías en el cierre. Esta parte sale del guion.', 20),
    ]
    expect(blockStarts(words, same).map((one) => one.seconds)).toEqual([expect.closeTo(0, 1), expect.closeTo(20, 1)])
  })

  it('a cut block whose sentences repeat another one’s is not found in its place', () => {
    const same = [
      { id: 'x', text: 'Esto es lo que dirías en el gancho. Esta parte sale del guion.' },
      { id: 'y', text: 'Esto es lo que dirías en el medio. Esta parte sale del guion.' },
      { id: 'z', text: 'Esto es lo que dirías en el cierre. Esta parte sale del guion.' },
    ]
    const words = [
      ...said('Esto es lo que dirías en el gancho. Esta parte sale del guion.', 0),
      ...said('Esto es lo que dirías en el cierre. Esta parte sale del guion.', 20),
    ]
    expect(blockStarts(words, same).map((one) => one.seconds)).toEqual([
      expect.closeTo(0, 1),
      null,
      expect.closeTo(20, 1),
    ])
  })

  it('without words, nothing is found', () => {
    expect(blockStarts([], BLOCKS).every((one) => one.seconds === null)).toBe(true)
  })
})
