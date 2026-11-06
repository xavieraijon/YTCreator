import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  CACHE_TTL_MS,
  HANDLE_CACHE_TTL_MS,
  createYtCacheRepo,
  createYtQuotaRepo,
  pacificDay,
  type YtCacheRepo,
  type YtQuotaRepo,
} from '../../../src/db/repos/yt-cache.ts'
import { freshDb, manualClock } from './helpers.ts'

const HOUR = 60 * 60 * 1000

describe('yt cache repo', () => {
  let db: DatabaseSync
  let cache: YtCacheRepo
  const clock = manualClock()

  beforeEach(() => {
    clock.set('2026-11-01T10:00:00.000Z')
    db = freshDb()
    cache = createYtCacheRepo(db, clock.now)
  })

  it('keeps search results for 24 hours', () => {
    expect(CACHE_TTL_MS).toBe(24 * HOUR)
    cache.set('ytdlp:search:cocina', { hits: 3 }, CACHE_TTL_MS)
    clock.advance(23 * HOUR)
    expect(cache.get('ytdlp:search:cocina')).toEqual({ hits: 3 })
    clock.advance(2 * HOUR)
    expect(cache.get('ytdlp:search:cocina')).toBeNull()
  })

  it('keeps handle checks for 1 hour', () => {
    expect(HANDLE_CACHE_TTL_MS).toBe(HOUR)
    cache.set('ytdlp:handle:sobras', 'libre', HANDLE_CACHE_TTL_MS)
    clock.advance(HOUR + 1)
    expect(cache.get('ytdlp:handle:sobras')).toBeNull()
  })

  it('overwrites an entry and purges the expired ones', () => {
    cache.set('a', 1, HOUR)
    cache.set('a', 2, HOUR)
    cache.set('b', 3, 3 * HOUR)
    expect(cache.get('a')).toBe(2)
    clock.advance(2 * HOUR)
    expect(cache.purgeExpired()).toBe(1)
    expect(cache.get('b')).toBe(3)
  })
})

describe('yt quota repo', () => {
  let quota: YtQuotaRepo
  const clock = manualClock()

  beforeEach(() => {
    quota = createYtQuotaRepo(freshDb(), clock.now)
  })

  it('counts days by the Pacific date, when Google resets the quota', () => {
    // 07:59 UTC is still the previous day in California (PDT is UTC−7 until 1 Nov 2026).
    expect(pacificDay(new Date('2026-10-20T06:59:00.000Z'))).toBe('2026-10-19')
    expect(pacificDay(new Date('2026-10-20T07:01:00.000Z'))).toBe('2026-10-20')
    // After the switch to PST (UTC−8).
    expect(pacificDay(new Date('2026-11-20T07:30:00.000Z'))).toBe('2026-11-19')
  })

  it('adds units to the current Pacific day and starts again the next day', () => {
    clock.set('2026-11-10T20:00:00.000Z')
    quota.add(100)
    quota.add(1)
    expect(quota.used()).toBe(101)
    clock.set('2026-11-11T07:30:00.000Z')
    expect(quota.used()).toBe(101)
    clock.set('2026-11-11T08:30:00.000Z')
    expect(quota.used()).toBe(0)
  })
})
