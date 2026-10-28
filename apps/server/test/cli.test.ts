import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runCli, type CliDeps } from '../src/cli.ts'

const homes: string[] = []

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

function isolatedHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ytc-cli-'))
  homes.push(dir)
  return dir
}

function deps(overrides: Partial<CliDeps> = {}): Partial<CliDeps> {
  return {
    env: {},
    platform: 'linux',
    homedir: isolatedHome(),
    version: '0.1.0',
    webDir: null,
    spawn: vi.fn(),
    print: vi.fn(),
    ...overrides,
  }
}

describe('runCli', () => {
  it('serve: starts (or reuses) the instance', async () => {
    const serveFn = vi.fn(async () => ({ reused: false, url: 'http://127.0.0.1:4310' }))

    const code = await runCli(['serve'], deps({ serve: serveFn }))

    expect(code).toBe(0)
    expect(serveFn).toHaveBeenCalledOnce()
  })

  it('open: starts if needed and opens the browser on macOS', async () => {
    const serveFn = vi.fn(async () => ({ reused: false, url: 'http://127.0.0.1:4310' }))
    const spawn = vi.fn()

    const code = await runCli(['open'], deps({ platform: 'darwin', serve: serveFn, spawn }))

    expect(code).toBe(0)
    expect(spawn).toHaveBeenCalledWith('open', ['http://127.0.0.1:4310'])
  })

  it('open: uses xdg-open on Linux when there is a graphical session', async () => {
    const serveFn = vi.fn(async () => ({ reused: true, url: 'http://127.0.0.1:4310' }))
    const spawn = vi.fn()

    const code = await runCli(['open'], deps({ platform: 'linux', env: { DISPLAY: ':0' }, serve: serveFn, spawn }))

    expect(code).toBe(0)
    expect(spawn).toHaveBeenCalledWith('xdg-open', ['http://127.0.0.1:4310'])
  })

  it('open: prints the address instead of opening a browser when there is no graphical environment', async () => {
    const serveFn = vi.fn(async () => ({ reused: false, url: 'http://127.0.0.1:4310' }))
    const spawn = vi.fn()
    const print = vi.fn()

    const code = await runCli(['open'], deps({ platform: 'linux', env: {}, serve: serveFn, spawn, print }))

    expect(code).toBe(0)
    expect(spawn).not.toHaveBeenCalled()
    expect(print).toHaveBeenCalledWith('YTCreator está en http://127.0.0.1:4310\n')
  })

  it('migrate: applies migrations and exits 0, without touching current', async () => {
    const code = await runCli(['migrate'], deps())
    expect(code).toBe(0)
  })

  it('migrate: exits with a non-zero code when migrations fail', async () => {
    vi.resetModules()
    vi.doMock('../src/db/migrate.ts', () => ({
      MIGRATIONS: [],
      migrate: () => {
        throw new Error('boom')
      },
    }))
    const { runCli: runCliWithBrokenMigrate } = await import('../src/cli.ts')

    const code = await runCliWithBrokenMigrate(['migrate'], deps())

    expect(code).toBe(60)
    vi.doUnmock('../src/db/migrate.ts')
    vi.resetModules()
  })

  it('exits with code 2 on an unknown argument', async () => {
    const code = await runCli(['frobnicate'], deps())
    expect(code).toBe(2)
  })

  it('exits with code 2 when no argument is given', async () => {
    const code = await runCli([], deps())
    expect(code).toBe(2)
  })
})
