import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { HOST, NoFreePortError, PORT_RANGE, startServer, type RunningServer } from '../src/main.ts'
import { appPaths, ForeignWorkspaceError } from '../src/paths.ts'

const running: RunningServer[] = []
const blockers: Server[] = []
const homes: string[] = []

afterEach(async () => {
  await Promise.all(running.splice(0).map((server) => server.close()))
  await Promise.all(blockers.splice(0).map((b) => new Promise((resolve) => b.close(resolve))))
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

function start(env: Record<string, string | undefined> = {}, allowFixedPort = false) {
  const home = mkdtempSync(join(tmpdir(), 'ytc-main-'))
  homes.push(home)
  const paths = appPaths({ platform: 'linux', env: {}, homedir: home })
  return { paths, started: startServer({ paths, env, version: '0.1.0', webDir: null, allowFixedPort }) }
}

async function startOk(env?: Record<string, string | undefined>, allowFixedPort?: boolean) {
  const { paths, started } = start(env, allowFixedPort)
  const server = await started
  running.push(server)
  return { paths, server }
}

function block(port: number): Promise<void> {
  const blocker = createServer()
  blockers.push(blocker)
  return new Promise((resolve, reject) => {
    blocker.once('error', reject)
    blocker.listen(port, HOST, () => resolve())
  })
}

describe('startServer', () => {
  it('listens only on 127.0.0.1, in the port range, and answers health', async () => {
    const { paths, server } = await startOk()
    expect(server.port).toBeGreaterThanOrEqual(PORT_RANGE.first)
    expect(server.port).toBeLessThanOrEqual(PORT_RANGE.last)

    const response = await fetch(`http://${HOST}:${server.port}/api/health`)
    expect(await response.json()).toEqual({ app: 'ytcreator', version: '0.1.0', instanceId: server.instanceId })

    const log = readFileSync(join(paths.logs, 'server.log'), 'utf8')
    expect(log).toContain('"event":"server_started"')
  })

  it('does not start on a YTCreator folder that is not its own, nor writes the database there', async () => {
    const home = mkdtempSync(join(tmpdir(), 'ytc-main-'))
    homes.push(home)
    const paths = appPaths({ platform: 'linux', env: {}, homedir: home })
    mkdirSync(paths.workspace)
    writeFileSync(join(paths.workspace, 'notas.txt'), 'mío')

    await expect(startServer({ paths, env: {}, version: '0.1.0', webDir: null })).rejects.toThrow(
      ForeignWorkspaceError,
    )
    expect(existsSync(paths.database)).toBe(false)
  })

  it('skips a port taken by another program', async () => {
    const first = await startOk()
    const second = await startOk()
    expect(second.server.port).not.toBe(first.server.port)
  })

  it('honours YTCREATOR_PORT only when the build allows it, and fails if it is taken', async () => {
    const free = await startOk()
    await free.server.close()
    running.splice(running.indexOf(free.server), 1)

    const fixed = await startOk({ YTCREATOR_PORT: String(free.server.port) }, true)
    expect(fixed.server.port).toBe(free.server.port)

    await expect(start({ YTCREATOR_PORT: String(free.server.port) }, true).started).rejects.toBeInstanceOf(
      NoFreePortError,
    )
    const ignored = await startOk({ YTCREATOR_PORT: String(free.server.port) }, false)
    expect(ignored.server.port).not.toBe(free.server.port)
  })

  it('fails with NoFreePortError when the whole range is taken', async () => {
    const taken: number[] = []
    for (let port = PORT_RANGE.first; port <= PORT_RANGE.last; port++) {
      try {
        await block(port)
        taken.push(port)
      } catch {
        // Already in use by something else: it counts as taken too.
      }
    }
    await expect(start().started).rejects.toBeInstanceOf(NoFreePortError)
    expect(taken.length).toBeGreaterThan(0)
  })
})
