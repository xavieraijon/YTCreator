import { describe, expect, it } from 'vitest'
import { isSimilar, keywordsOf } from '../../src/ideas/similar.ts'

describe('keywordsOf (R1)', () => {
  it('takes out the empty words in Spanish and English and normalizes', () => {
    expect(keywordsOf('Cómo hacer PAN de masa madre en casa')).toEqual(['hacer', 'pan', 'masa', 'madre', 'casa'])
    expect(keywordsOf('How to bake the best bread at home')).toEqual(['bake', 'best', 'bread', 'home'])
    expect(keywordsOf('pan, pan y más pan')).toEqual(['pan'])
  })
})

describe('isSimilar (R1)', () => {
  const four = keywordsOf('pan masa madre casero')
  it('asks for 75 % of the key words rounded up', () => {
    expect(isSimilar('Pan de masa madre fácil', four)).toBe(true) // 3 of 4
    expect(isSimilar('Pan casero rápido', four)).toBe(false) // 2 of 4
  })
  it('asks for at least two, and with one key word that one is enough', () => {
    expect(isSimilar('Pan y nada más', keywordsOf('pan masa'))).toBe(false)
    expect(isSimilar('Pan con masa', keywordsOf('pan masa'))).toBe(true)
    expect(isSimilar('El mejor PAN', keywordsOf('pan'))).toBe(true)
    expect(isSimilar('Bizcocho', keywordsOf('pan'))).toBe(false)
    expect(isSimilar('Cualquier cosa', [])).toBe(false)
  })
  it('accents and capitals do not count', () => {
    expect(isSimilar('CÓMO HACER CAFÉ', keywordsOf('como hacer cafe'))).toBe(true)
  })
  it('a word inside another is not the word', () => {
    expect(isSimilar('Empanada de atún', keywordsOf('pan atun'))).toBe(false)
  })
})
