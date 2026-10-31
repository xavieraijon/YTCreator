import type { AiFailure, ConnectionStatus, FailureReason } from './failures.ts'
import type { CheckResult } from './port.ts'

// Rotation between the Claude accounts of the subscription (research R14, FR-016c).

export interface AccountState {
  id: string
  position: number
  status: ConnectionStatus
  reason?: FailureReason | null
  resetsAt?: string | null // ISO
}

export interface AccountSwitched {
  fromId: string
  toId: string
  reason: 'cupo_agotado'
}

// The new state of an account that was called; the server stores it.
export interface AccountUpdate {
  id: string
  outcome: CheckResult
}

// Both check() and generate() results fit here.
type Outcome = { ok: true } | { ok: false; failure: AiFailure }

export interface RotationRun<R extends Outcome> {
  result: R | { ok: false; failure: AiFailure }
  updates: AccountUpdate[]
  switched: AccountSwitched[]
}

const outOfQuotaUntil = (account: AccountState, now: Date) =>
  account.status === 'cupo_agotado' && !!account.resetsAt && Date.parse(account.resetsAt) > now.getTime()

const byPosition = (accounts: AccountState[]) => [...accounts].sort((a, b) => a.position - b.position)

// Rule 1: in position order, without sin_sesion and without cupo_agotado until a future resetsAt.
export function pickCandidates(accounts: AccountState[], now: Date): AccountState[] {
  return byPosition(accounts).filter((a) => a.status !== 'sin_sesion' && !outOfQuotaUntil(a, now))
}

const quotaFailure = (): AiFailure => ({ kind: 'cupo_agotado', reason: 'limite_de_uso' })

// Rule 2: nothing to call. Out of quota with the nearest resetsAt, or the failure of the first account.
function noCandidates(accounts: AccountState[]): AiFailure {
  const resets = accounts
    .filter((a) => a.status === 'cupo_agotado')
    .map((a) => a.resetsAt)
    .filter((d): d is string => !!d)
    .sort((a, b) => Date.parse(a) - Date.parse(b))
  if (accounts.some((a) => a.status === 'cupo_agotado')) {
    return resets[0] ? { kind: 'cupo_agotado', reason: 'limite_de_uso', resetsAt: resets[0] } : quotaFailure()
  }
  const first = byPosition(accounts)[0]
  if (first?.status === 'sin_sesion' && first.reason) return { kind: 'sin_sesion', reason: first.reason }
  return { kind: 'sin_sesion', reason: 'sesion_caducada' }
}

// Rules 3–5: each candidate is called once at most, and only cupo_agotado moves on to the next one.
export async function runWithRotation<R extends Outcome>(
  accounts: AccountState[],
  call: (accountId: string) => Promise<R>,
  now: Date,
): Promise<RotationRun<R>> {
  const candidates = pickCandidates(accounts, now)
  const updates: AccountUpdate[] = []
  const switched: AccountSwitched[] = []
  if (candidates.length === 0) return { result: { ok: false, failure: noCandidates(accounts) }, updates, switched }

  const states = new Map(accounts.map((a) => [a.id, a]))
  for (const [index, candidate] of candidates.entries()) {
    const result = await call(candidate.id)
    updates.push({ id: candidate.id, outcome: result.ok ? { ok: true } : { ok: false, failure: result.failure } })
    if (result.ok || result.failure.kind !== 'cupo_agotado') return { result, updates, switched }

    const { resetsAt } = result.failure
    states.set(candidate.id, { ...candidate, status: 'cupo_agotado', reason: result.failure.reason, resetsAt })
    const next = candidates[index + 1]
    if (next) switched.push({ fromId: candidate.id, toId: next.id, reason: 'cupo_agotado' })
  }
  return { result: { ok: false, failure: noCandidates([...states.values()]) }, updates, switched }
}
