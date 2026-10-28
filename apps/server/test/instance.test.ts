import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PORT_RANGE, startServer, type RunningServer } from '../src/main.ts'
import { acquireInstance, findRunningInstance, releaseInstance, writeInstanceFile } from '../src/instance.ts'
import { appPaths, type AppPaths } from '../src/paths.ts'

const homes: string[] = []
const running: RunningServer[] = []

afterEach(async () => {
  await Promise.all(running.splice(0).map((server) => server.close()))
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

function home(): AppPaths {
  const dir = mkdtempSync(join(tmpdir(), 'ytc-instance-'))
  homes.push(dir)
  const paths = appPaths({ platform: 'linux', env: {}, homedir: dir })
  mkdirSync(paths.appHome, { recursive: true })
  return paths
}

function fakeServer(port = 4310, instanceId = 'i-fake'): RunningServer {
  return { port, instanceId, close: vi.fn(async () => {}) }
}

describe('acquireInstance', () => {
  it('writes instance.json on start and removes it on an orderly release', async () => {
    const paths = home()
    const server = fakeServer()
    const result = await acquireInstance({ paths, version: '0.1.0', start: async () => server })

    expect(result.reused).toBe(false)
    const written = JSON.parse(readFileSync(paths.instanceFile, 'utf8'))
    expect(written).toMatchObject({ pid: process.pid, port: 4310, instanceId: 'i-fake', version: '0.1.0' })
    expect(typeof written.startedAt).toBe('string')

    await releaseInstance(paths, server)
    expect(server.close).toHaveBeenCalledOnce()
    expect(existsSync(paths.instanceFile)).toBe(false)
  })

  it('reuses a live instance that answers /api/health as ytcreator, instead of starting a second one', async () => {
    const paths = home()
    writeInstanceFile(paths, {
      pid: process.pid,
      port: 4320,
      instanceId: 'i-running',
      version: '0.1.0',
      startedAt: new Date().toISOString(),
    })
    const start = vi.fn()

    const result = await acquireInstance({
      paths,
      version: '0.1.0',
      start,
      checkHealth: async () => ({ app: 'ytcreator', instanceId: 'i-running' }),
    })

    expect(result).toEqual({ reused: true, port: 4320, instanceId: 'i-running', url: 'http://127.0.0.1:4320' })
    expect(start).not.toHaveBeenCalled()
  })

  it('ignores an instance.json whose pid is dead and starts a new one', async () => {
    const paths = home()
    writeInstanceFile(paths, {
      pid: 999999,
      port: 4320,
      instanceId: 'i-dead',
      version: '0.1.0',
      startedAt: new Date().toISOString(),
    })
    const server = fakeServer(4311, 'i-new')

    const result = await acquireInstance({ paths, version: '0.1.0', start: async () => server, isAlive: () => false })

    expect(result).toEqual({ reused: false, server, url: 'http://127.0.0.1:4311' })
    const written = JSON.parse(readFileSync(paths.instanceFile, 'utf8'))
    expect(written.instanceId).toBe('i-new')
  })

  it('ignores a live process that answers health with a different instanceId (another program on that port)', async () => {
    const paths = home()
    writeInstanceFile(paths, {
      pid: process.pid,
      port: 4320,
      instanceId: 'i-ours',
      version: '0.1.0',
      startedAt: new Date().toISOString(),
    })

    const found = await findRunningInstance(paths, {
      checkHealth: async () => ({ app: 'ytcreator', instanceId: 'someone-else' }),
    })

    expect(found).toBeNull()
  })

  it('skips ports already taken by another program when combined with a real server', async () => {
    const paths = home()
    const result = await acquireInstance({
      paths,
      version: '0.1.0',
      start: () => startServer({ paths, env: {}, version: '0.1.0', webDir: null }),
    })

    expect(result.reused).toBe(false)
    if (result.reused) throw new Error('unreachable')
    running.push(result.server)
    expect(result.server.port).toBeGreaterThanOrEqual(PORT_RANGE.first)
    expect(result.server.port).toBeLessThanOrEqual(PORT_RANGE.last)
  })
})
