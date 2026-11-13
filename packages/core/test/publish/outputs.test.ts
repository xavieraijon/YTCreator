import { describe, expect, it } from 'vitest'
import {
  AI_TITLE_MAX,
  rejectWebAddresses,
  thumbnailsOutput,
  thumbnailsOutputFor,
  titlesOutput,
  titlesOutputFor,
} from '../../src/publish/outputs.ts'

const title = (text: string, blockId = 'b1') => ({ text, why: 'Promete lo que cuenta el vídeo.', blockId })
const titles = (count: number, blockId = 'b1') =>
  Array.from({ length: count }, (_, index) => title(`Título número ${index + 1}`, blockId))
const concept = (titleIndex: number) => ({
  scene: 'Una barra de pan partida por la mitad.',
  bigText: 'SIN AMASAR',
  emotion: 'Sorpresa',
  composition: 'El pan a la izquierda, la cara a la derecha.',
  colors: 'Marrón tostado sobre fondo azul.',
  titleIndex,
})

describe('rejectWebAddresses (research.md R4)', () => {
  it('finds an address in any text, however deep', () => {
    expect(rejectWebAddresses({ a: [{ b: 'mira https://otra.example' }] })).toBe(true)
    expect(rejectWebAddresses({ a: 'http://x.example' })).toBe(true)
    expect(rejectWebAddresses(['en www.pan.example'])).toBe(true)
    expect(rejectWebAddresses({ a: 'HTTPS://X.EXAMPLE' })).toBe(true)
  })

  it('lets plain text, numbers and empty values through', () => {
    expect(rejectWebAddresses({ a: 'Pan sin amasar en casa', n: 3, z: null, l: [] })).toBe(false)
  })
})

describe('titulos (contracts/ai-uses.md)', () => {
  it('from 5 to 8 in a long video, from 3 to 5 in a Short', () => {
    const long = titlesOutputFor('largo', ['b1'])
    const short = titlesOutputFor('short', ['b1'])
    expect(long.safeParse({ titles: titles(5) }).success).toBe(true)
    expect(long.safeParse({ titles: titles(8) }).success).toBe(true)
    expect(long.safeParse({ titles: titles(4) }).success).toBe(false)
    expect(long.safeParse({ titles: titles(9) }).success).toBe(false)
    expect(short.safeParse({ titles: titles(3) }).success).toBe(true)
    expect(short.safeParse({ titles: titles(5) }).success).toBe(true)
    expect(short.safeParse({ titles: titles(6) }).success).toBe(false)
  })

  it('each title fits YouTube, though what the creator writes may go further (decision 13)', () => {
    expect(AI_TITLE_MAX).toBe(100)
    const long = [...titles(4), title('x'.repeat(101))]
    expect(titlesOutputFor('largo', ['b1']).safeParse({ titles: long }).success).toBe(false)
    expect(titlesOutputFor('largo', ['b1']).safeParse({ titles: [...titles(4), title('x'.repeat(100))] }).success).toBe(
      true,
    )
  })

  it('each one points at a block of the approved script (research.md R8)', () => {
    expect(titlesOutputFor('largo', ['b1']).safeParse({ titles: titles(5, 'otro') }).success).toBe(false)
  })

  it('no web address anywhere', () => {
    const withAddress = [...titles(4), title('Mira www.pan.example')]
    expect(titlesOutput.safeParse({ titles: withAddress }).success).toBe(false)
  })
})

describe('miniaturas (contracts/ai-uses.md)', () => {
  it('exactly three, each for the main title or one of the alternatives', () => {
    const three = thumbnailsOutputFor(3)
    expect(three.safeParse({ concepts: [concept(0), concept(1), concept(2)] }).success).toBe(true)
    expect(three.safeParse({ concepts: [concept(0), concept(1)] }).success).toBe(false)
    expect(three.safeParse({ concepts: [concept(0), concept(0), concept(0), concept(0)] }).success).toBe(false)
    expect(three.safeParse({ concepts: [concept(0), concept(1), concept(3)] }).success).toBe(false)
  })

  it('only the titles there are: without alternatives, all for the main one', () => {
    expect(thumbnailsOutputFor(1).safeParse({ concepts: [concept(0), concept(0), concept(1)] }).success).toBe(false)
    expect(thumbnailsOutputFor(1).safeParse({ concepts: [concept(0), concept(0), concept(0)] }).success).toBe(true)
  })

  it('no web address anywhere', () => {
    const bad = { ...concept(0), scene: 'Como en https://otro.example' }
    expect(thumbnailsOutput.safeParse({ concepts: [bad, concept(0), concept(0)] }).success).toBe(false)
  })
})
