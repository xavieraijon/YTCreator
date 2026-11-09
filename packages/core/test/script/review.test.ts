import { describe, expect, it } from 'vitest'
import type { Claim, DraftBlock } from '../../src/script/model.ts'
import { type ReviewInput, reviewScript } from '../../src/script/review.ts'

const rules = {
  maxSentenceWords: 10,
  hookMaxSeconds: { largo: 4, short: 2 },
  durationTolerance: 0.1,
  fillers: ['cabe destacar', 'mil'],
}
const block = (id: string, text: string, type: DraftBlock['type'] = 'acto'): DraftBlock => ({
  id,
  type,
  title: id,
  text,
  visual: '',
})
const claim = (blockId: string, status: Claim['status'] = 'pendiente'): Claim => ({
  id: `${blockId}-${status}`,
  blockId,
  text: 'x',
  status,
  reason: 'sin_respaldo',
  factId: null,
  check: null,
})
const words = (n: number) => Array.from({ length: n }, () => 'hola').join(' ')
// 60 words a minute: a word is a second, so the sums are easy to read.
const review = (fields: Partial<ReviewInput>) =>
  reviewScript({ format: 'largo', targetSeconds: 10, wordsPerMinute: 60, blocks: [], claims: [], rules, ...fields })

describe('reviewScript', () => {
  const fine = [block('a', words(3), 'gancho'), block('b', words(7))]

  it('says nothing of a script that is right', () => {
    expect(review({ blocks: fine })).toEqual([])
  })

  it('warns when it lasts too much, at the longest block', () => {
    expect(review({ blocks: [block('a', words(3), 'gancho'), block('b', `${words(9)}. ${words(9)}`)] })).toContainEqual(
      {
        rule: 'duracion',
        blockId: 'b',
        seconds: 21,
        target: 10,
      },
    )
  })

  it('warns when it falls short, at the shortest block', () => {
    expect(review({ blocks: [block('a', words(2), 'gancho'), block('b', words(4))] })).toContainEqual({
      rule: 'duracion',
      blockId: 'a',
      seconds: 6,
      target: 10,
    })
  })

  it('accepts what is within the tolerance', () => {
    const notices = review({ blocks: [block('a', words(3), 'gancho'), block('b', words(8))] })
    expect(notices.filter((one) => one.rule === 'duracion')).toEqual([])
  })

  it('warns of a long hook, by format', () => {
    const blocks = [block('a', words(5), 'gancho'), block('b', words(5))]
    expect(review({ blocks })).toContainEqual({ rule: 'gancho_largo', blockId: 'a', seconds: 5, limit: 4 })
    expect(review({ blocks: [block('a', words(3), 'gancho'), block('b', words(7))], format: 'short' })).toContainEqual({
      rule: 'gancho_largo',
      blockId: 'a',
      seconds: 3,
      limit: 2,
    })
  })

  it('finds the fillers, as whole words and in any case', () => {
    const blocks = [block('a', 'Cabe destacar esto.', 'gancho'), block('b', 'La familia come bien hoy y ya está aquí.')]
    const fillers = review({ blocks }).filter((one) => one.rule === 'muletilla')
    expect(fillers).toEqual([{ rule: 'muletilla', blockId: 'a', text: 'cabe destacar' }])
  })

  it('warns of a sentence too long to say', () => {
    const long = `${words(11)}.`
    const notices = review({ blocks: [block('a', words(3), 'gancho'), block('b', `Corta. ${long}`)] })
    expect(notices).toContainEqual({ rule: 'frase_larga', blockId: 'b', text: long, words: 11 })
  })

  it('does not end a sentence inside a figure', () => {
    const text = `Son 1.200 ${words(9)}.`
    expect(review({ blocks: [block('b', text)] })).toContainEqual({
      rule: 'frase_larga',
      blockId: 'b',
      text,
      words: 11,
    })
  })

  it('counts what is still to check, block by block', () => {
    const notices = review({
      blocks: fine,
      claims: [claim('b'), { ...claim('b'), id: 'other' }, claim('a', 'confirmada')],
    })
    expect(notices).toEqual([{ rule: 'por_comprobar', blockId: 'b', count: 2 }])
  })

  it('ends a sentence at a line break and after a closing quote', () => {
    const sentence = words(rules.maxSentenceWords)
    const long = (text: string) => review({ blocks: [block('a', text)] }).filter((one) => one.rule === 'frase_larga')
    expect(long(`${sentence}\n${sentence}`)).toEqual([])
    expect(long(`«${sentence}.» ${sentence}.`)).toEqual([])
  })

  it('reviews 4.500 words in less than a second (SC-006)', () => {
    const blocks = Array.from({ length: 30 }, (_, index) => block(`b${index}`, `${words(10)}. `.repeat(15)))
    const start = performance.now()
    review({ blocks, targetSeconds: 4500 })
    expect(performance.now() - start).toBeLessThan(1000)
  })
})
