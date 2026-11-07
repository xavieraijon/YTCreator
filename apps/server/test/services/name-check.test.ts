import { youtubeFailure, type VideoHit, type YouTubeData } from '@ytcreator/core'
import { describe, expect, it, vi } from 'vitest'
import { createNameCheck, MAX_NAME_CHECKS, NAME_CHECK_TTL_MS, type NameToCheck } from '../../src/services/name-check.ts'
import type { NameCheck, NamesRepo } from '../../src/db/repos/names.ts'
import type { JobsService } from '../../src/services/jobs.ts'

const sourced = <T>(data: T) => ({ ok: true as const, value: { data, source: 'fake' as const, fetchedAt: 'x' } })
const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }

function setup(youtube: Partial<Pick<YouTubeData, 'search' | 'checkHandle'>> = {}, now = () => new Date(0)) {
  const stored: NameCheck[] = []
  const names = {
    record: (check: Omit<NameCheck, 'id' | 'checkedAt'>) => {
      const saved = { ...check, id: String(stored.length), checkedAt: now().toISOString() }
      stored.push(saved)
      return saved
    },
    listByJourney: () => stored,
  } as unknown as NamesRepo
  const items: NameCheck[] = []
  const progress: number[] = []
  let finished: Promise<void> = Promise.resolve()
  const jobs = {
    start: (_: unknown, work: (job: unknown) => Promise<void>) => {
      finished = work({ progress: (done: number) => progress.push(done), item: (item: NameCheck) => items.push(item) })
      return { id: 'job' }
    },
  } as unknown as JobsService
  const search = vi.fn(youtube.search ?? (async () => sourced<VideoHit[]>([])))
  const checkHandle = vi.fn(youtube.checkHandle ?? (async () => sourced('libre' as const)))
  const service = createNameCheck({
    youtube: { search, checkHandle },
    names,
    jobs,
    thresholds: { titleHits: 3, maxLength: 30 },
    logger,
    now,
  })
  return { service, items, progress, stored, search, checkHandle, done: () => finished }
}

const name = (displayName: string): NameToCheck => ({ displayName, handle: displayName, origin: 'ia' })

describe('name-check', () => {
  it('each name emits an item with its semaphore', async () => {
    const t = setup({ checkHandle: async (h) => sourced(h === 'Ocupado' ? 'ocupado' : 'libre') })
    t.service.start('j1', [name('Libre'), name('Ocupado')])
    await t.done()
    expect(t.items.map((i) => [i.displayName, i.semaphore])).toEqual([
      ['Libre', 'verde'],
      ['Ocupado', 'rojo'],
    ])
    expect(t.progress).toEqual([1, 2])
  })

  it('checks at most 4 names at a time', async () => {
    let running = 0
    let peak = 0
    const t = setup({
      checkHandle: async () => {
        running += 1
        peak = Math.max(peak, running)
        await new Promise((resolve) => setTimeout(resolve, 5))
        running -= 1
        return sourced('libre' as const)
      },
    })
    t.service.start(
      'j1',
      Array.from({ length: 10 }, (_, i) => name(`Nombre${i}`)),
    )
    await t.done()
    expect(peak).toBe(MAX_NAME_CHECKS)
    expect(t.items).toHaveLength(10)
  })

  it('a name looked at within the hour is not asked again', async () => {
    let at = 0
    const t = setup({}, () => new Date(at))
    t.service.start('j1', [name('Uno')])
    await t.done()
    at = NAME_CHECK_TTL_MS - 1
    t.service.start('j1', [name('Uno')])
    await t.done()
    expect(t.checkHandle).toHaveBeenCalledTimes(1)
    expect(t.items).toHaveLength(2)
    at = NAME_CHECK_TTL_MS + 1
    t.service.start('j1', [name('Uno')])
    await t.done()
    expect(t.checkHandle).toHaveBeenCalledTimes(2)
  })

  it('a check that could not be done is never green, and is asked again', async () => {
    const t = setup({ checkHandle: async () => youtubeFailure('bloqueado') })
    t.service.start('j1', [name('Uno')])
    await t.done()
    expect(t.items[0]).toMatchObject({ semaphore: 'sin_comprobar', handleStatus: 'sin_comprobar', reasons: ['fallo'] })
    t.service.start('j1', [name('Uno')])
    await t.done()
    expect(t.checkHandle).toHaveBeenCalledTimes(2)
  })

  it('a search with no results is good news, not a failure', async () => {
    const t = setup({ search: async () => youtubeFailure('sin_datos') })
    t.service.start('j1', [name('Uno')])
    await t.done()
    expect(t.items[0]!.semaphore).toBe('verde')
  })

  it('a search that could not be read is not «no results»: never green (P9, US3 AS4)', async () => {
    const t = setup({ search: async () => youtubeFailure('no_disponible') })
    t.service.start('j1', [name('Uno')])
    await t.done()
    expect(t.items[0]!.semaphore).toBe('sin_comprobar')
  })

  it('a search blocked leaves it unchecked, and one that throws does not stop the rest', async () => {
    const t = setup({
      search: async (query) => {
        if (query === 'Rompe') throw new Error('boom')
        return youtubeFailure('bloqueado')
      },
    })
    t.service.start('j1', [name('Rompe'), name('Dos')])
    await t.done()
    expect(t.items.map((i) => i.semaphore)).toEqual(['sin_comprobar', 'sin_comprobar'])
  })
})
