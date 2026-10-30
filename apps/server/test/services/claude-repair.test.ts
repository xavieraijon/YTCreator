import { FAKE_LOGIN_CODE } from '@ytcreator/ai'
import { aiOverviewSchema } from '@ytcreator/core/api'
import { describe, expect, it, vi } from 'vitest'
import { makeTestApp } from '../helpers.ts'

// A fake installer that ends when the test says so.
function controlledInstaller() {
  let finish: (exitCode: number) => void = () => {}
  const run = vi.fn(
    () =>
      new Promise<number>((resolve) => {
        finish = resolve
      }),
  )
  return { run, finish: (exitCode: number) => finish(exitCode) }
}

const NOT_INSTALLED = {
  ok: false as const,
  failure: { kind: 'no_disponible' as const, reason: 'programa_no_instalado' as const },
}

// A connected subscription account whose last check found Claude Code missing.
async function accountWithoutClaude(t: ReturnType<typeof makeTestApp>) {
  const login = (await (await t.request('POST', '/api/ai/subscription/login', {})).json()) as { loginId: string }
  await t.request('POST', `/api/ai/subscription/login/${login.loginId}/complete`, { code: FAKE_LOGIN_CODE })
  const account = t.accounts.list('claude-code')[0]!
  t.accounts.updateStatus(account.id, NOT_INSTALLED)
  return account.id
}

const state = async (t: ReturnType<typeof makeTestApp>) => (await t.request('GET', '/api/ai/repair-claude-code')).json()

describe('POST/GET /api/ai/repair-claude-code', () => {
  it('starts with inactivo, answers 202 en_curso, and ends hecho with exit code 0', async () => {
    const installer = controlledInstaller()
    const t = makeTestApp({ fakeAi: 'ok', installer: installer.run })
    expect(await state(t)).toEqual({ state: 'inactivo' })

    const started = await t.request('POST', '/api/ai/repair-claude-code', {})
    expect(started.status).toBe(202)
    expect(await started.json()).toEqual({ state: 'en_curso' })
    expect(await state(t)).toEqual({ state: 'en_curso' })

    installer.finish(0)
    await t.repair.settled()
    expect(await state(t)).toEqual({ state: 'hecho' })
    const overview = aiOverviewSchema.parse(await (await t.request('GET', '/api/ai')).json())
    expect(overview.claudeCode.repair).toEqual({ state: 'hecho' })
  })

  it('a second POST while one is running does not start another installer', async () => {
    const installer = controlledInstaller()
    const t = makeTestApp({ fakeAi: 'ok', installer: installer.run })
    await t.request('POST', '/api/ai/repair-claude-code', {})
    const again = await t.request('POST', '/api/ai/repair-claude-code', {})
    expect(again.status).toBe(202)
    expect(await again.json()).toEqual({ state: 'en_curso' })
    expect(installer.run).toHaveBeenCalledTimes(1)
    installer.finish(0)
    await t.repair.settled()
  })

  it('a non-zero exit code → fallido, and it can be tried again', async () => {
    const installer = controlledInstaller()
    const t = makeTestApp({ fakeAi: 'ok', installer: installer.run })
    await t.request('POST', '/api/ai/repair-claude-code', {})
    installer.finish(7)
    await t.repair.settled()
    expect(await state(t)).toEqual({ state: 'fallido' })

    await t.request('POST', '/api/ai/repair-claude-code', {})
    expect(installer.run).toHaveBeenCalledTimes(2)
    installer.finish(0)
    await t.repair.settled()
  })

  it('logs only the exit code, never what the installer printed', async () => {
    const installer = controlledInstaller()
    const t = makeTestApp({ fakeAi: 'ok', installer: installer.run })
    await t.request('POST', '/api/ai/repair-claude-code', {})
    installer.finish(3)
    await t.repair.settled()
    const finished = t.logger.lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((entry) => entry.event === 'claude_repair.finished')
    expect(finished).toHaveLength(1)
    expect(Object.keys(finished[0]!).sort()).toEqual(['event', 'exitCode', 'level', 'ts'])
    expect(finished[0]!.exitCode).toBe(3)
  })

  it('once installed, the accounts that failed for its absence are checked again before it says hecho', async () => {
    const installer = controlledInstaller()
    const t = makeTestApp({ fakeAi: 'ok', installer: installer.run })
    const id = await accountWithoutClaude(t)
    await t.request('POST', '/api/ai/repair-claude-code', {})
    installer.finish(0)
    await t.repair.settled()
    const overview = aiOverviewSchema.parse(await (await t.request('GET', '/api/ai')).json())
    expect(overview.claudeCode.repair).toEqual({ state: 'hecho' })
    expect(overview.accounts.find((a) => a.id === id)?.status).toBe('conectada')
  })

  it('a failed install leaves the accounts as they were', async () => {
    const installer = controlledInstaller()
    const t = makeTestApp({ fakeAi: 'ok', installer: installer.run })
    const id = await accountWithoutClaude(t)
    await t.request('POST', '/api/ai/repair-claude-code', {})
    installer.finish(1)
    await t.repair.settled()
    expect(t.accounts.get(id)?.reason).toBe('programa_no_instalado')
  })
})
