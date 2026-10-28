import { FAILURE_REASONS, type AiFailure, type FailureKind } from '@ytcreator/core'

// What check() does for one account.
export type FakeOutcome =
  | { type: 'ok' }
  | { type: 'fail'; failure: AiFailure }
  | { type: 'cupo'; resetsAt?: string } // without a date: one hour after the check
  | { type: 'lento' } // no answer until the timeout

export type FakeLoginMode = 'ok' | 'codigo_malo' | 'duplicada' | 'otra_cuenta'

export interface FakeScenario {
  name: string
  accounts: FakeOutcome[] // by account position; a single entry for the non-subscription keys
  login: FakeLoginMode
}

export class UnknownScenarioError extends Error {
  constructor(name: string) {
    super(`Escenario de IA falsa desconocido: ${name}`)
    this.name = 'UnknownScenarioError'
  }
}

// `otra_cuenta` gives a new token on every login, like `ok`: re-logging an account gets another fingerprint.
const LOGIN_MODES: readonly string[] = ['codigo_malo', 'duplicada', 'otra_cuenta']

function isFailureKind(kind: string): kind is FailureKind {
  return Object.hasOwn(FAILURE_REASONS, kind)
}

function isIsoDate(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T/.test(text) && !Number.isNaN(Date.parse(text))
}

function parseOutcome(text: string): FakeOutcome | null {
  if (text === 'ok') return { type: 'ok' }
  if (text === 'lento') return { type: 'lento' }
  if (text === 'cupo') return { type: 'cupo' }
  const colon = text.indexOf(':')
  if (colon < 0) return null
  const head = text.slice(0, colon)
  const tail = text.slice(colon + 1)
  if (head === 'cupo') return isIsoDate(tail) ? { type: 'cupo', resetsAt: tail } : null
  if (!isFailureKind(head)) return null
  const reasons: readonly string[] = FAILURE_REASONS[head]
  if (!reasons.includes(tail)) return null
  return { type: 'fail', failure: { kind: head, reason: tail as AiFailure['reason'] } }
}

// `YTCREATOR_FAKE_AI=<name>` (contracts/ai-provider.md, «Proveedor falso»). A typo fails loudly.
export function parseScenario(name: string): FakeScenario {
  if (name.startsWith('login:')) {
    const mode = name.slice('login:'.length)
    if (!LOGIN_MODES.includes(mode)) throw new UnknownScenarioError(name)
    return { name, accounts: [{ type: 'ok' }], login: mode as FakeLoginMode }
  }
  if (name.startsWith('cuentas:')) {
    const accounts = name.slice('cuentas:'.length).split(',').map(parseOutcome)
    if (accounts.length === 0 || accounts.some((a) => a === null)) throw new UnknownScenarioError(name)
    return { name, accounts: accounts as FakeOutcome[], login: 'ok' }
  }
  const outcome = parseOutcome(name)
  if (!outcome) throw new UnknownScenarioError(name)
  return { name, accounts: [outcome], login: 'ok' }
}
