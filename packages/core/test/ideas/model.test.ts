import { describe, expect, it } from 'vitest'
import {
  IDEA_FORMATS,
  IDEA_ORIGINS,
  IDEA_STATUSES,
  IDEA_VERDICTS,
  canMoveIdea,
  ideaDraftSchema,
  ideaMeasureUnits,
  searchTextSchema,
} from '../../src/ideas/model.ts'

const draft = {
  title: 'Por qué Venus gira al revés',
  hook: 'Un día en Venus dura más que su año.',
  pillar: 'Planetas',
  format: 'largo',
  query: 'venus gira al reves',
  broadQuery: 'venus planeta',
  queryEn: 'why venus spins backwards',
}

describe('the idea model (data-model.md)', () => {
  it('has the states, formats, origins and traffic lights of the contract', () => {
    expect(IDEA_STATUSES).toEqual(['banco', 'elegida', 'hecha', 'archivada'])
    expect(IDEA_FORMATS).toEqual(['largo', 'short'])
    expect(IDEA_ORIGINS).toEqual(['ia', 'creador', 'otro_enfoque'])
    expect(IDEA_VERDICTS).toEqual(['hueco', 'competido', 'quemado', 'frio'])
  })

  it('accepts a draft within its limits', () => {
    expect(ideaDraftSchema.parse(draft)).toEqual(draft)
  })

  it.each([
    ['title', ''],
    ['title', 'x'.repeat(121)],
    ['hook', ''],
    ['hook', 'x'.repeat(301)],
    ['format', 'medio'],
    ['query', ''],
    ['query', 'x'.repeat(121)],
    ['broadQuery', 'con "comillas"'],
    ['queryEn', ''],
  ])('refuses %s = %j', (field, value) => {
    expect(ideaDraftSchema.safeParse({ ...draft, [field]: value }).success).toBe(false)
  })
})

describe('search texts (contracts/ai-uses.md, «Búsquedas»)', () => {
  it.each(['cena -rapida', 'cena OR tupper', 'cena | tupper', '+cena', 'intitle:cena'])(
    'refuses the operator in %j',
    (text) => {
      expect(searchTextSchema.safeParse(text).success).toBe(false)
    },
  )

  it.each(['cena rapida', "what's for dinner", 'tupper-semanal', 'recetas 2026'])('accepts %j', (text) => {
    expect(searchTextSchema.safeParse(text).success).toBe(true)
  })
})

describe('the moves of an idea (data-model.md, «Estados»)', () => {
  it('follows the diagram: out of the archive only back to the bank', () => {
    expect(canMoveIdea('banco', 'elegida')).toBe(true)
    expect(canMoveIdea('elegida', 'banco')).toBe(true)
    expect(canMoveIdea('elegida', 'hecha')).toBe(true)
    expect(canMoveIdea('hecha', 'archivada')).toBe(true)
    expect(canMoveIdea('hecha', 'banco')).toBe(true)
    expect(canMoveIdea('archivada', 'banco')).toBe(true)
    expect(canMoveIdea('archivada', 'elegida')).toBe(false)
    expect(canMoveIdea('archivada', 'hecha')).toBe(false)
    expect(canMoveIdea('hecha', 'elegida')).toBe(false)
  })
})

describe('Data API units of a measure (FR-007c)', () => {
  it('two or three searches, each one page and one read of its videos', () => {
    const units = { searchUnits: 100, otherUnits: 1 }
    expect(ideaMeasureUnits(units, true)).toBe(303)
    expect(ideaMeasureUnits(units, false)).toBe(202)
  })
})
