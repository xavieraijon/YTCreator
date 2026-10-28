import { Secret, type AiFailure, type SubscriptionLogin } from '@ytcreator/core'
import type { FakeScenario } from './scenarios.ts'

export const FAKE_LOGIN_URL = 'https://example.invalid/ytcreator/inicio-de-sesion-falso'
export const FAKE_LOGIN_CODE = 'ABCD-1234'
const EXPIRES_MS = 10 * 60 * 1000

const BAD_CODE: AiFailure = { kind: 'sin_sesion', reason: 'codigo_no_valido' }

// `sk-ant-oat-FAKE-<n>-…`: the n-th account of the scenario, see fake-provider.ts.
export function fakeToken(account: number): Secret {
  return Secret.from(`sk-ant-oat-FAKE-${account}-${'x'.repeat(40)}`)
}

// One login at a time, like `claude setup-token`; starting another cancels the open one.
export function createFakeLogin(scenario: FakeScenario, now: () => Date = () => new Date()): SubscriptionLogin {
  let started = 0
  let issued = 0
  let open: { loginId: string; expiresAt: number } | null = null

  return {
    async start() {
      started += 1
      const expiresAt = now().getTime() + EXPIRES_MS
      open = { loginId: `fake-login-${started}`, expiresAt }
      return {
        ok: true,
        value: { loginId: open.loginId, url: FAKE_LOGIN_URL, expiresAt: new Date(expiresAt).toISOString() },
      }
    },

    async complete(loginId, code) {
      const current = open
      open = null
      if (!current || current.loginId !== loginId || now().getTime() >= current.expiresAt) {
        return { ok: false, failure: BAD_CODE }
      }
      if (scenario.login === 'codigo_malo' || code.reveal() !== FAKE_LOGIN_CODE) {
        return { ok: false, failure: BAD_CODE }
      }
      // `duplicada` always gives the first account's token: the same fingerprint.
      if (scenario.login === 'duplicada') return { ok: true, token: fakeToken(1) }
      issued += 1
      return { ok: true, token: fakeToken(issued) }
    },

    async cancel(loginId) {
      if (open?.loginId === loginId) open = null
    },
  }
}
