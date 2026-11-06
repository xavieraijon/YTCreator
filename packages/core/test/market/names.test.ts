import { describe, expect, it } from 'vitest'
import { type NameFindings, nameFindings, normalizeName, semaphoreOf, type VideoHit } from '../../src/index.ts'

const thresholds = { titleHits: 3, maxLength: 30 }
const clean: NameFindings = { sameName: false, similarChannels: [], titleHits: 0 }
const check = (changes: Partial<Parameters<typeof semaphoreOf>[0]> = {}) =>
  semaphoreOf({ displayName: 'Cocina Corta', handleStatus: 'libre', findings: clean, ...changes }, thresholds)
const hit = (title: string, channelTitle: string, channelId = channelTitle): VideoHit =>
  ({ videoId: title, title, channelId, channelTitle, views: 1, publishedAt: null, durationSeconds: 300 }) as VideoHit

describe('semaphore of a name (FR-017)', () => {
  it('clean is green', () => {
    expect(check()).toEqual({ semaphore: 'verde', reasons: [] })
  })
  it('a taken @ or a channel with the same name is red', () => {
    expect(check({ handleStatus: 'ocupado' })).toEqual({ semaphore: 'rojo', reasons: ['handle_ocupado'] })
    expect(check({ findings: { ...clean, sameName: true } })).toEqual({ semaphore: 'rojo', reasons: ['nombre_igual'] })
  })
  it('similar channels, 3 or more titles or a long name are amber', () => {
    const similar = { ...clean, similarChannels: [{ title: 'Cocinas Cortas', handle: null, subscribers: null }] }
    expect(check({ findings: similar })).toEqual({ semaphore: 'ambar', reasons: ['parecidos'] })
    expect(check({ findings: { ...clean, titleHits: 3 } }).semaphore).toBe('ambar')
    expect(check({ findings: { ...clean, titleHits: 2 } }).semaphore).toBe('verde')
    expect(check({ displayName: 'x'.repeat(31) })).toEqual({ semaphore: 'ambar', reasons: ['largo'] })
    expect(check({ displayName: 'x'.repeat(30) }).semaphore).toBe('verde')
  })
  it('red wins over amber', () => {
    expect(check({ handleStatus: 'ocupado', displayName: 'x'.repeat(31) }).semaphore).toBe('rojo')
  })
  it('any failure is «sin comprobar» and never green, keeping what is known', () => {
    expect(check({ handleStatus: 'sin_comprobar' })).toEqual({ semaphore: 'sin_comprobar', reasons: ['fallo'] })
    expect(check({ findings: null })).toEqual({ semaphore: 'sin_comprobar', reasons: ['fallo'] })
    expect(check({ findings: null, handleStatus: 'ocupado' })).toEqual({
      semaphore: 'sin_comprobar',
      reasons: ['handle_ocupado', 'fallo'],
    })
  })
})

describe('what a search says about a name', () => {
  it('ignores case, accents and punctuation', () => {
    expect(normalizeName('  Fogón-Rápido! ')).toBe('fogon rapido')
    expect(nameFindings('Fogón Rápido', [hit('Algo', 'FOGON rapido')]).sameName).toBe(true)
  })
  it('finds channels called nearly the same, each once', () => {
    const { similarChannels, sameName } = nameFindings('Cocina Corta', [
      hit('a', 'Cocina Cortas'),
      hit('b', 'Cocina Cortas'),
      hit('c', 'La Cocina Corta de Ana'),
      hit('d', 'Deportes Hoy'),
    ])
    expect(sameName).toBe(false)
    expect(similarChannels.map((c) => c.title)).toEqual(['Cocina Cortas', 'La Cocina Corta de Ana'])
  })
  it('counts the videos with the name in the title', () => {
    const hits = [hit('Mi cocina corta', 'A'), hit('COCINA CORTA 2', 'B'), hit('Otra cosa', 'C')]
    expect(nameFindings('Cocina Corta', hits).titleHits).toBe(2)
  })
})
