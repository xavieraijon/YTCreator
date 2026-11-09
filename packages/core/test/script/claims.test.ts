import { describe, expect, it } from 'vitest'
import type { Claim, Fact } from '../../src/script/model.ts'
import {
  detectClaims,
  occurrences,
  replaceFragment,
  settleOrphans,
  splitMarks,
  withoutFragment,
} from '../../src/script/claims.ts'

let next = 0
const newId = () => `c${(next += 1)}`
const detect = (
  text: string,
  known: string[] = [],
  facts: Fact[] = [],
  ai: { text: string; factId: string | null }[] = [],
) =>
  detectClaims({
    blocks: [{ id: 'b', text }],
    known,
    facts,
    aiClaims: ai.map((one) => ({ ...one, blockId: 'b' })),
    newId,
  })
const texts = (text: string, known?: string[]) => detect(text, known).map((claim) => claim.text)
const fact = (id: string, text: string, label: Fact['label']): Fact => ({
  id,
  text,
  label,
  origin: 'ia',
  sources: [],
  alternatives: null,
})

describe('detectClaims (recorded cases, SC-003)', () => {
  it.each([
    ['Lo hace el 40 % de la gente.', ['40 %']],
    ['Lo hace el 40% de la gente.', ['40%']],
    ['Lo hace el 12,5 por ciento.', ['12,5 por ciento']],
    ['Pasó en 1998 y fue raro.', ['1998']],
    ['Cuesta 250 euros al mes.', ['250']],
    ['Se vendieron 1.200 unidades.', ['1.200']],
    ['Nació el 3 de mayo de 1950 en un pueblo.', ['3 de mayo de 1950']],
    ['Fue el 14 de julio cuando empezó.', ['14 de julio']],
    ['Volvió en marzo de 2021 a casa.', ['marzo de 2021']],
    ['Lo vieron 3 millones de personas.', ['3 millones']],
    ['Lo vieron dos millones de personas.', ['dos millones']],
    ['Costó mil euros.', ['mil']],
    ['Llegó a un millón de visitas.', ['un millón']],
  ])('%s', (text, expected) => {
    expect(texts(text)).toEqual(expected)
  })

  it('finds proper names away from the start of a sentence', () => {
    expect(texts('Lo dijo Ana López ayer.')).toEqual(['Ana López'])
    expect(texts('Trabajaba en el Banco de España entonces.')).toEqual(['Banco de España'])
    expect(texts('Ayer Ana lo dijo.')).toEqual(['Ana'])
  })

  it('leaves the word that only starts a sentence', () => {
    expect(texts('Hoy hace sol. Mañana también. ¿Quién lo sabe? Nadie.')).toEqual([])
  })

  it('ignores what is in the notes, the facts or the idea', () => {
    expect(texts('Lo hace el 40 % de la gente.', ['el 40 % lo hace mal'])).toEqual([])
    expect(texts('Se vendieron 1.200 unidades.', ['fueron 1200 en total'])).toEqual([])
    expect(texts('Lo dijo Ana López ayer.', ['entrevista a ana lópez'])).toEqual([])
  })

  it('does not take a figure for part of a longer one', () => {
    expect(texts('Cuesta 250 euros.', ['2500 euros'])).toEqual(['250'])
  })

  it.each([
    ['En 2020 lo hicieron 20 personas.', ['2020', '20']],
    ['Lo vieron 3 millones de personas en 3 días.', ['3 millones', '3']],
    ['Cuesta 250 euros y 50 de envío.', ['250', '50']],
  ])('does not lose a figure inside another: %s', (text, expected) => {
    expect(texts(text)).toEqual(expected)
  })

  it('finds a name between brackets', () => {
    expect(texts('Lo contó ella (Ana López) ayer.')).toEqual(['Ana López'])
  })

  it('does not mark what the AI lists when it comes from the notes', () => {
    expect(detect('Se vendieron 1.200 unidades.', ['fueron 1.200'], [], [{ text: '1.200', factId: null }])).toEqual([])
  })

  it('marks one figure once per block', () => {
    expect(texts('En 1998 pasó. Y en 1998 volvió a pasar.')).toEqual(['1998'])
  })
})

describe('detectClaims, with what the AI says', () => {
  it('joins its claims without repeating what was detected', () => {
    const claims = detect('El 40 % de la gente lo hace mal.', [], [], [{ text: 'El 40 % de la gente', factId: null }])
    expect(claims.map((claim) => claim.text)).toEqual(['El 40 % de la gente'])
  })

  it('ignores a claim whose words are not in the block', () => {
    expect(detect('Nada que marcar.', [], [], [{ text: 'otra cosa', factId: null }])).toEqual([])
  })

  it('does not mark what comes from a fact that holds', () => {
    const facts = [fact('f1', 'El 40 % lo hace mal', 'comprobado')]
    expect(detect('El 40 % lo hace mal.', [], facts, [{ text: 'El 40 % lo hace mal', factId: 'f1' }])).toEqual([])
    expect(texts('Lo hace el 40 %.', ['El 40 % lo hace mal'])).toEqual([])
  })

  it.each(['una_fuente', 'sin_confirmar'] as const)('marks as doubtful what comes from a fact %s', (label) => {
    const facts = [fact('f1', 'Cerró en 1998', label)]
    expect(detect('Cerró en 1998 sin avisar.', [], facts)[0]).toMatchObject({
      text: '1998',
      reason: 'hecho_dudoso',
      factId: 'f1',
      status: 'pendiente',
    })
    expect(detect('Cerró en 1998.', [], facts, [{ text: 'Cerró en 1998', factId: 'f1' }])[0]).toMatchObject({
      reason: 'hecho_dudoso',
      factId: 'f1',
    })
  })

  it('without a backing fact the reason is that', () => {
    expect(detect('Pasó en 1998.')[0]).toMatchObject({ reason: 'sin_respaldo', factId: null, check: null })
  })
})

describe('a mark is a whole fragment', () => {
  it('is not inside another word or figure', () => {
    expect(occurrences('La familia pagó mil.', 'mil')).toEqual([[16, 19]])
    expect(occurrences('15 años y 5 días', '5')).toEqual([[10, 11]])
    expect(occurrences('Son 1,5 kilos', '5')).toEqual([])
    expect(occurrences('Son 1.200 kilos', '200')).toEqual([])
  })

  it('correcting leaves other words alone', () => {
    expect(replaceFragment('Costó mil euros a la familia.', 'mil', 'dos mil')).toBe('Costó dos mil euros a la familia.')
    expect(replaceFragment('En 2020 eran 20 personas.', '20', '30')).toBe('En 2020 eran 30 personas.')
  })

  it('taking it out removes the fragment and nothing else', () => {
    expect(withoutFragment('Se vendieron 1.200 unidades. Y ya.', '1.200')).toBe('Se vendieron unidades. Y ya.')
    expect(withoutFragment('Costó mil. Mi familia pagó.', 'mil')).toBe('Costó. Mi familia pagó.')
  })
})

describe('settleOrphans', () => {
  const claim = (status: Claim['status'], text = '1998'): Claim => ({
    id: 'c',
    blockId: 'b',
    text,
    status,
    reason: 'sin_respaldo',
    factId: null,
    check: null,
  })

  it('takes away a mark whose words are gone', () => {
    expect(settleOrphans([claim('pendiente')], [{ id: 'b', text: 'Sin año.' }])[0]!.status).toBe('quitada')
    expect(settleOrphans([claim('confirmada')], [{ id: 'b', text: 'Sin año.' }])[0]!.status).toBe('quitada')
  })

  it('does not take a word that contains it for the mark', () => {
    expect(settleOrphans([claim('pendiente', 'mil')], [{ id: 'b', text: 'La familia.' }])[0]!.status).toBe('quitada')
  })

  it('keeps the rest as it was', () => {
    expect(settleOrphans([claim('pendiente')], [{ id: 'b', text: 'En 1998.' }])[0]!.status).toBe('pendiente')
    expect(settleOrphans([claim('sin_marca')], [{ id: 'b', text: 'Nada.' }])[0]!.status).toBe('sin_marca')
  })
})

describe('splitMarks', () => {
  const pending = (id: string, text: string): Claim => ({
    id,
    blockId: 'b',
    text,
    status: 'pendiente',
    reason: 'sin_respaldo',
    factId: null,
    check: null,
  })

  it('cuts the text around every appearance of a mark', () => {
    expect(splitMarks('En 1998 y en 1998.', [pending('a', '1998')])).toEqual([
      { text: 'En ' },
      { text: '1998', claimId: 'a' },
      { text: ' y en ' },
      { text: '1998', claimId: 'a' },
      { text: '.' },
    ])
  })

  it('takes the longest when two overlap, and never loses text', () => {
    const parts = splitMarks('El 40 % lo sabe.', [pending('a', '40'), pending('b', 'El 40 %')])
    expect(parts).toEqual([{ text: 'El 40 %', claimId: 'b' }, { text: ' lo sabe.' }])
    expect(parts.map((part) => part.text).join('')).toBe('El 40 % lo sabe.')
  })

  it('does not paint a mark inside a word', () => {
    expect(splitMarks('Mi familia.', [pending('a', 'mil')])).toEqual([{ text: 'Mi familia.' }])
  })

  it('without marks it is the text', () => {
    expect(splitMarks('Nada.', [])).toEqual([{ text: 'Nada.' }])
  })
})
