import { describe, expect, it } from 'vitest'
import { dropRepeats, duplicateOf } from '../../src/ideas/repeats.ts'

describe('repeated ideas (research R9)', () => {
  const existing = [{ title: 'Cena en diez minutos', query: 'cena rapida' }, { title: 'Tupper semanal' }]

  it('drops the candidates whose title or search repeats one, accents and case aside', () => {
    const candidates = [
      { title: 'CENA en diez minutos!', query: 'otra' },
      { title: 'Algo nuevo', query: 'Cena rápida' },
      { title: 'Desayunos', query: 'desayunos' },
    ]
    expect(dropRepeats(candidates, existing)).toEqual({ kept: [candidates[2]], removed: 2 })
  })

  it('two candidates of the same batch that repeat each other keep only the first', () => {
    const candidates = [{ title: 'Pan casero' }, { title: 'pan  casero' }]
    expect(dropRepeats(candidates, [])).toEqual({ kept: [candidates[0]], removed: 1 })
  })

  it('finds the idea with the same title', () => {
    const ideas = [{ id: 'a', title: 'Cena en diez minutos' }]
    expect(duplicateOf('cena en DIEZ minutos', ideas)).toBe('a')
    expect(duplicateOf('Otra cosa', ideas)).toBeNull()
  })
})
