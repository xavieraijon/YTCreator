import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { AiUse, FailureKind } from '@ytcreator/core'

export type UsageOutcome = 'ok' | FailureKind | 'respuesta_invalida' | 'limite_de_gasto'

export interface NewUsage {
  journeyId?: string | null
  use: AiUse
  providerId: string
  model: string
  inputTokens: number
  outputTokens: number
  estimatedCents: number
  costCents: number
  pricingVersion: number
  outcome: UsageOutcome
}

export interface Usage extends Required<NewUsage> {
  id: string
  createdAt: string
}

interface Row {
  id: string
  journey_id: string | null
  use: AiUse
  provider_id: string
  model: string
  input_tokens: number
  output_tokens: number
  estimated_cents: number
  cost_cents: number
  pricing_version: number
  outcome: UsageOutcome
  created_at: string
}

const fromRow = (row: Row): Usage => ({
  id: row.id,
  journeyId: row.journey_id,
  use: row.use,
  providerId: row.provider_id,
  model: row.model,
  inputTokens: row.input_tokens,
  outputTokens: row.output_tokens,
  estimatedCents: row.estimated_cents,
  costCents: row.cost_cents,
  pricingVersion: row.pricing_version,
  outcome: row.outcome,
  createdAt: row.created_at,
})

// «Hoy» and «mes en curso» follow the creator's local clock, not UTC.
const startOfDay = (at: Date) => new Date(at.getFullYear(), at.getMonth(), at.getDate())
const startOfMonth = (at: Date) => new Date(at.getFullYear(), at.getMonth(), 1)

export function createUsageRepo(db: DatabaseSync, now: () => Date = () => new Date()) {
  const selectOne = db.prepare('SELECT * FROM ai_usage WHERE id = ?')
  const selectAll = db.prepare('SELECT * FROM ai_usage ORDER BY created_at DESC, rowid DESC LIMIT ?')
  const insert = db.prepare(
    `INSERT INTO ai_usage (id, journey_id, use, provider_id, model, input_tokens, output_tokens, estimated_cents,
       cost_cents, pricing_version, outcome, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const sumSince = db.prepare('SELECT COALESCE(SUM(cost_cents), 0) AS cents FROM ai_usage WHERE created_at >= ?')

  const get = (id: string): Usage | null => {
    const row = selectOne.get(id) as Row | undefined
    return row ? fromRow(row) : null
  }

  return {
    get,

    record(usage: NewUsage): Usage {
      const id = randomUUID()
      insert.run(
        id,
        usage.journeyId ?? null,
        usage.use,
        usage.providerId,
        usage.model,
        usage.inputTokens,
        usage.outputTokens,
        usage.estimatedCents,
        usage.costCents,
        usage.pricingVersion,
        usage.outcome,
        now().toISOString(),
      )
      return get(id)!
    },

    list(limit = 100): Usage[] {
      return (selectAll.all(limit) as unknown as Row[]).map(fromRow)
    },

    totals(at: Date = now()): { dayCents: number; monthCents: number } {
      const sum = (since: Date) => (sumSince.get(since.toISOString()) as { cents: number }).cents
      return { dayCents: sum(startOfDay(at)), monthCents: sum(startOfMonth(at)) }
    },
  }
}

export type UsageRepo = ReturnType<typeof createUsageRepo>
