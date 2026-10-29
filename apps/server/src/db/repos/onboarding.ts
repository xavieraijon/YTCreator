import type { DatabaseSync } from 'node:sqlite'
import { transition, type TransitionResult, type WizardInput } from '@ytcreator/core'
import type { OnboardingState } from '@ytcreator/core/api'
import { inTransaction } from '../transaction.ts'
import type { ConnectionsRepo } from './connections.ts'

interface Row {
  step: OnboardingState['step']
  chosen_kind: OnboardingState['chosenKind']
  postponed: number
  revision: number
  completed_at: string | null
}

export function createOnboardingRepo(
  db: DatabaseSync,
  connections: ConnectionsRepo,
  now: () => Date = () => new Date(),
) {
  const select = db.prepare('SELECT step, chosen_kind, postponed, revision, completed_at FROM onboarding_state')
  const update = db.prepare(
    `UPDATE onboarding_state SET step = ?, chosen_kind = ?, postponed = ?, revision = ?, completed_at = ?,
       updated_at = ? WHERE id = 1`,
  )

  const get = (): OnboardingState => {
    const row = select.get() as unknown as Row
    return {
      step: row.step,
      chosenKind: row.chosen_kind,
      postponed: row.postponed === 1,
      revision: row.revision,
      completedAt: row.completed_at,
    }
  }

  return {
    get,

    // The step and the activation of the connection go in one transaction (data-model.md).
    apply(input: WizardInput): TransitionResult {
      return inTransaction(db, () => {
        const state = get()
        const connection = state.chosenKind ? connections.get(state.chosenKind) : null
        const result = transition(state, input, {
          connected: connection?.status === 'conectada',
          hasLimits: connections.hasLimits(),
          now: now(),
        })
        if (!result.ok) return result
        const next = result.state
        update.run(
          next.step,
          next.chosenKind,
          next.postponed ? 1 : 0,
          next.revision,
          next.completedAt,
          now().toISOString(),
        )
        if (result.activate) connections.setActive(result.activate)
        return result
      })
    },
  }
}

export type OnboardingRepo = ReturnType<typeof createOnboardingRepo>
