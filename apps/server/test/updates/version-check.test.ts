import { describe, expect, it, vi } from 'vitest'
import { createVersionCheck } from '../../src/updates/version-check.ts'
import { createMemoryLogger } from '../../src/logging.ts'
import { createSettingsRepo } from '../../src/db/repos/settings.ts'
import { openDatabase } from '../../src/db/open.ts'
import { migrate, MIGRATIONS } from '../../src/db/migrate.ts'

function setup(now: Date) {
  const db = openDatabase(':memory:')
  migrate(db, MIGRATIONS)
  const settings = createSettingsRepo(db)
  const logger = createMemoryLogger(() => now)
  return { settings, logger }
}

describe('createVersionCheck', () => {
  it('asks the release base for VERSION and saves it with the check time', async () => {
    const now = new Date('2026-10-29T10:00:00.000Z')
    const { settings, logger } = setup(now)
    const fetch = vi.fn(async () => new Response('1.3.0\n', { status: 200 }))
    const check = createVersionCheck({ fetch, now: () => now, settings, logger, releaseBase: 'https://example.test' })

    await check.run()

    expect(settings.get('latest_version')).toBe('1.3.0')
    expect(settings.get('last_update_check_at')).toBe(now.toISOString())
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('sends no creator data: a plain GET, no body, no instance id, no OS details beyond a fixed User-Agent', async () => {
    const now = new Date('2026-10-29T10:00:00.000Z')
    const { settings, logger } = setup(now)
    const fetch = vi.fn(async () => new Response('1.3.0', { status: 200 }))
    const check = createVersionCheck({ fetch, now: () => now, settings, logger, releaseBase: 'https://example.test' })

    await check.run()

    const call = fetch.mock.calls[0] as unknown as [string | URL, RequestInit | undefined]
    const [url, init] = call
    expect(String(url)).toBe('https://example.test/VERSION')
    expect(init?.method ?? 'GET').toBe('GET')
    expect(init?.body).toBeUndefined()
    const headers = new Headers(init?.headers)
    expect(headers.get('user-agent')).toBe('YTCreator')
    expect([...headers.keys()].sort()).toEqual(['user-agent'])
  })

  it('queries at most once every 24h', async () => {
    const now = new Date('2026-10-29T10:00:00.000Z')
    const { settings, logger } = setup(now)
    const fetch = vi.fn(async () => new Response('1.3.0', { status: 200 }))
    const check = createVersionCheck({ fetch, now: () => now, settings, logger, releaseBase: 'https://example.test' })

    await check.run()
    await check.run()
    expect(fetch).toHaveBeenCalledTimes(1)

    const sameDay = new Date(now.getTime() + 23 * 60 * 60 * 1000)
    const checkSameDay = createVersionCheck({
      fetch,
      now: () => sameDay,
      settings,
      logger,
      releaseBase: 'https://example.test',
    })
    await checkSameDay.run()
    expect(fetch).toHaveBeenCalledTimes(1)

    const nextDay = new Date(now.getTime() + 25 * 60 * 60 * 1000)
    const checkNextDay = createVersionCheck({
      fetch,
      now: () => nextDay,
      settings,
      logger,
      releaseBase: 'https://example.test',
    })
    await checkNextDay.run()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('makes zero requests when the creator disabled the notice', async () => {
    const now = new Date('2026-10-29T10:00:00.000Z')
    const { settings, logger } = setup(now)
    settings.set('update_check_enabled', false)
    const fetch = vi.fn(async () => new Response('1.3.0', { status: 200 }))
    const check = createVersionCheck({ fetch, now: () => now, settings, logger, releaseBase: 'https://example.test' })

    await check.run()

    expect(fetch).not.toHaveBeenCalled()
    expect(settings.get('last_update_check_at')).toBeNull()
  })

  it('silently ignores a network failure, only logging it, and still records the check time', async () => {
    const now = new Date('2026-10-29T10:00:00.000Z')
    const { settings, logger } = setup(now)
    const fetch = vi.fn(async () => {
      throw new Error('network down')
    })
    const check = createVersionCheck({ fetch, now: () => now, settings, logger, releaseBase: 'https://example.test' })

    await expect(check.run()).resolves.toBeUndefined()

    expect(settings.get('latest_version')).toBeNull()
    expect(settings.get('last_update_check_at')).toBe(now.toISOString())
    expect(logger.lines.some((line) => line.includes('version_check'))).toBe(true)
  })

  it('ignores a non-OK response the same way', async () => {
    const now = new Date('2026-10-29T10:00:00.000Z')
    const { settings, logger } = setup(now)
    const fetch = vi.fn(async () => new Response('not found', { status: 404 }))
    const check = createVersionCheck({ fetch, now: () => now, settings, logger, releaseBase: 'https://example.test' })

    await check.run()

    expect(settings.get('latest_version')).toBeNull()
    expect(settings.get('last_update_check_at')).toBe(now.toISOString())
  })
})
