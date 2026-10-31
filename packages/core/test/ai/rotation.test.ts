import { describe, expect, it, vi } from 'vitest'
import type { AiFailure } from '../../src/ai/failures.ts'
import type { AiResult } from '../../src/ai/port.ts'
import { pickCandidates, runWithRotation, type AccountState } from '../../src/ai/rotation.ts'

const NOW = new Date('2026-10-29T10:00:00.000Z')
const PAST = '2026-10-29T09:00:00.000Z'
const SOON = '2026-10-29T12:00:00.000Z'
const LATER = '2026-10-29T18:00:00.000Z'

const ok: AiResult<string> = { ok: true, value: 'hola', usage: {} }
const fail = (failure: AiFailure): AiResult<string> => ({ ok: false, failure })
const quota = (resetsAt?: string) => fail({ kind: 'cupo_agotado', reason: 'limite_de_uso', resetsAt })

const account = (id: string, position: number, rest: Partial<AccountState> = {}): AccountState => ({
  id,
  position,
  status: 'conectada',
  ...rest,
})

// Answers by account id, and records the order of the calls.
function caller(results: Record<string, AiResult<string>>) {
  return vi.fn((id: string) => Promise.resolve(results[id] ?? ok))
}

describe('pickCandidates', () => {
  it('R1: orders by position, not by the order of the list', () => {
    const accounts = [account('c', 3), account('a', 1), account('b', 2)]
    expect(pickCandidates(accounts, NOW).map((a) => a.id)).toEqual(['a', 'b', 'c'])
  })

  it('leaves out sin_sesion and cupo_agotado with a future resetsAt', () => {
    const accounts = [
      account('a', 1, { status: 'sin_sesion', reason: 'sesion_caducada' }),
      account('b', 2, { status: 'cupo_agotado', resetsAt: SOON }),
      account('c', 3, { status: 'no_disponible' }),
      account('d', 4, { status: 'sin_comprobar' }),
    ]
    expect(pickCandidates(accounts, NOW).map((a) => a.id)).toEqual(['c', 'd'])
  })

  it('R6: cupo_agotado with a resetsAt already past is a candidate again', () => {
    const accounts = [account('a', 1, { status: 'cupo_agotado', resetsAt: PAST })]
    expect(pickCandidates(accounts, NOW).map((a) => a.id)).toEqual(['a'])
  })
})

describe('runWithRotation', () => {
  it('R1: calls the first account by position and stops when it works', async () => {
    const call = caller({})
    const run = await runWithRotation([account('b', 2), account('a', 1)], call, NOW)
    expect(call.mock.calls).toEqual([['a']])
    expect(run).toEqual({ result: ok, updates: [{ id: 'a', outcome: { ok: true } }], switched: [] })
  })

  it('cupo_agotado moves on to the next account and says so', async () => {
    const call = caller({ a: quota(SOON) })
    const run = await runWithRotation([account('a', 1), account('b', 2)], call, NOW)
    expect(call.mock.calls).toEqual([['a'], ['b']])
    expect(run).toEqual({
      result: ok,
      updates: [
        { id: 'a', outcome: { ok: false, failure: { kind: 'cupo_agotado', reason: 'limite_de_uso', resetsAt: SOON } } },
        { id: 'b', outcome: { ok: true } },
      ],
      switched: [{ fromId: 'a', toId: 'b', reason: 'cupo_agotado' }],
    })
  })

  it('R2: each account is tried once at most; all out of quota → the nearest resetsAt', async () => {
    const call = caller({ a: quota(LATER), b: quota(SOON), c: quota() })
    const run = await runWithRotation([account('a', 1), account('b', 2), account('c', 3)], call, NOW)
    expect(call.mock.calls).toEqual([['a'], ['b'], ['c']])
    expect(run.result).toEqual(fail({ kind: 'cupo_agotado', reason: 'limite_de_uso', resetsAt: SOON }))
    expect(run.updates.map((u) => u.id)).toEqual(['a', 'b', 'c'])
    expect(run.switched).toEqual([
      { fromId: 'a', toId: 'b', reason: 'cupo_agotado' },
      { fromId: 'b', toId: 'c', reason: 'cupo_agotado' },
    ])
  })

  it('R3: tiempo_agotado does not rotate and comes back as it is', async () => {
    const slowFailure: AiFailure = { kind: 'tiempo_agotado', reason: 'respuesta_lenta' }
    const slow = fail(slowFailure)
    const call = caller({ a: slow })
    const run = await runWithRotation([account('a', 1), account('b', 2)], call, NOW)
    expect(call.mock.calls).toEqual([['a']])
    expect(run).toEqual({
      result: slow,
      updates: [{ id: 'a', outcome: { ok: false, failure: slowFailure } }],
      switched: [],
    })
  })

  it('any other failure after a switch also stops the rotation', async () => {
    const down = fail({ kind: 'no_disponible', reason: 'sin_conexion' })
    const call = caller({ a: quota(SOON), b: down })
    const run = await runWithRotation([account('a', 1), account('b', 2), account('c', 3)], call, NOW)
    expect(call.mock.calls).toEqual([['a'], ['b']])
    expect(run.result).toEqual(down)
    expect(run.switched).toEqual([{ fromId: 'a', toId: 'b', reason: 'cupo_agotado' }])
  })

  it('R4: with every account out of quota it does not call, and gives the nearest resetsAt', async () => {
    const call = caller({})
    const accounts = [
      account('a', 1, { status: 'cupo_agotado', reason: 'limite_de_uso', resetsAt: LATER }),
      account('b', 2, { status: 'sin_sesion', reason: 'sesion_caducada' }),
      account('c', 3, { status: 'cupo_agotado', reason: 'limite_de_uso', resetsAt: SOON }),
    ]
    const run = await runWithRotation(accounts, call, NOW)
    expect(call).not.toHaveBeenCalled()
    expect(run).toEqual({
      result: fail({ kind: 'cupo_agotado', reason: 'limite_de_uso', resetsAt: SOON }),
      updates: [],
      switched: [],
    })
  })

  it('R5: with every account sin_sesion, the failure of the first one by position', async () => {
    const call = caller({})
    const accounts = [
      account('b', 2, { status: 'sin_sesion', reason: 'sin_permiso' }),
      account('a', 1, { status: 'sin_sesion', reason: 'sesion_caducada' }),
    ]
    const run = await runWithRotation(accounts, call, NOW)
    expect(call).not.toHaveBeenCalled()
    expect(run.result).toEqual(fail({ kind: 'sin_sesion', reason: 'sesion_caducada' }))
  })

  it('without any account at all → sin_sesion / sesion_caducada, without calling', async () => {
    const call = caller({})
    const run = await runWithRotation([], call, NOW)
    expect(call).not.toHaveBeenCalled()
    expect(run.result).toEqual(fail({ kind: 'sin_sesion', reason: 'sesion_caducada' }))
  })

  it('R6: an account whose quota already came back is called again', async () => {
    const call = caller({})
    const accounts = [account('a', 1, { status: 'cupo_agotado', reason: 'limite_de_uso', resetsAt: PAST })]
    const run = await runWithRotation(accounts, call, NOW)
    expect(call.mock.calls).toEqual([['a']])
    expect(run.result).toEqual(ok)
  })
})
