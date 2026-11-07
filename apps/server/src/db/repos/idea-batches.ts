import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { CandidateDecision, IdeaBatchKind } from '@ytcreator/core'

// Each batch the AI proposed for a channel, and what the creator did with each candidate (data-model.md).
export type { CandidateDecision }

export interface IdeaBatch {
  id: string
  channelId: string
  kind: IdeaBatchKind
  sourceIdeaId: string | null
  payload: unknown
  decisions: Record<number, CandidateDecision>
  removedRepeats: number
  instructions: string | null
  promptId: string
  promptVersion: number
  claimsTrimmed: boolean
  usageId: string | null
  profileVersion: number
  createdAt: string
}

export interface NewIdeaBatch {
  channelId: string
  kind: IdeaBatchKind
  sourceIdeaId?: string | null
  payload: unknown
  removedRepeats?: number
  instructions?: string | null
  promptId: string
  promptVersion: number
  claimsTrimmed?: boolean
  usageId?: string | null
  profileVersion: number
}

interface Row {
  id: string
  channel_id: string
  kind: IdeaBatchKind
  source_idea_id: string | null
  payload: string
  decisions: string
  removed_repeats: number
  instructions: string | null
  prompt_id: string
  prompt_version: number
  claims_trimmed: number
  usage_id: string | null
  profile_version: number
  created_at: string
}

const fromRow = (row: Row): IdeaBatch => ({
  id: row.id,
  channelId: row.channel_id,
  kind: row.kind,
  sourceIdeaId: row.source_idea_id,
  payload: JSON.parse(row.payload) as unknown,
  decisions: JSON.parse(row.decisions) as Record<number, CandidateDecision>,
  removedRepeats: Number(row.removed_repeats),
  instructions: row.instructions,
  promptId: row.prompt_id,
  promptVersion: Number(row.prompt_version),
  claimsTrimmed: row.claims_trimmed === 1,
  usageId: row.usage_id,
  profileVersion: Number(row.profile_version),
  createdAt: row.created_at,
})

// How many candidates a batch has, whatever its kind.
export const candidatesOf = (batch: IdeaBatch): unknown[] => {
  const payload = batch.payload as { ideas?: unknown[]; angles?: unknown[] }
  return payload.ideas ?? payload.angles ?? []
}

export const isPending = (batch: IdeaBatch) =>
  candidatesOf(batch).some((_, index) => batch.decisions[index] === undefined)

export function createIdeaBatchesRepo(db: DatabaseSync, now: () => Date = () => new Date()) {
  const selectOne = db.prepare('SELECT * FROM idea_batch WHERE id = ?')
  const selectByChannel = db.prepare(
    'SELECT * FROM idea_batch WHERE channel_id = ? AND kind = ? ORDER BY created_at, rowid',
  )
  const selectAllByChannel = db.prepare('SELECT * FROM idea_batch WHERE channel_id = ? ORDER BY created_at, rowid')
  const insert = db.prepare(
    `INSERT INTO idea_batch (id, channel_id, kind, source_idea_id, payload, removed_repeats, instructions, prompt_id,
       prompt_version, claims_trimmed, usage_id, profile_version, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const setDecisions = db.prepare('UPDATE idea_batch SET decisions = ? WHERE id = ?')

  const get = (id: string): IdeaBatch | null => {
    const row = selectOne.get(id) as Row | undefined
    return row ? fromRow(row) : null
  }

  return {
    get,

    create(batch: NewIdeaBatch): IdeaBatch {
      const id = randomUUID()
      insert.run(
        id,
        batch.channelId,
        batch.kind,
        batch.sourceIdeaId ?? null,
        JSON.stringify(batch.payload),
        batch.removedRepeats ?? 0,
        batch.instructions ?? null,
        batch.promptId,
        batch.promptVersion,
        batch.claimsTrimmed ? 1 : 0,
        batch.usageId ?? null,
        batch.profileVersion,
        now().toISOString(),
      )
      return get(id)!
    },

    list: (channelId: string): IdeaBatch[] => (selectAllByChannel.all(channelId) as unknown as Row[]).map(fromRow),

    // The last batch of this kind with candidates still waiting, if it is the last one (http-api.md).
    pending(channelId: string, kind: IdeaBatchKind): IdeaBatch | null {
      // A batch left empty by the repeats is skipped: the one before it is still the one being decided (entry 17).
      const last = (selectByChannel.all(channelId, kind) as unknown as Row[])
        .map(fromRow)
        .filter((batch) => candidatesOf(batch).length > 0)
        .at(-1)
      return last && isPending(last) ? last : null
    },

    decide(id: string, decisions: Record<number, CandidateDecision>): IdeaBatch | null {
      const current = get(id)
      if (!current) return null
      setDecisions.run(JSON.stringify({ ...current.decisions, ...decisions }), id)
      return get(id)
    },

    // A new batch leaves the candidates of the previous one that were still waiting.
    discardPending(channelId: string, kind: IdeaBatchKind): void {
      for (const batch of (selectByChannel.all(channelId, kind) as unknown as Row[]).map(fromRow)) {
        const waiting = candidatesOf(batch)
          .map((_, index) => index)
          .filter((index) => batch.decisions[index] === undefined)
        if (waiting.length > 0) {
          setDecisions.run(
            JSON.stringify({
              ...batch.decisions,
              ...Object.fromEntries(waiting.map((index) => [index, 'descartada'])),
            }),
            batch.id,
          )
        }
      }
    },
  }
}

export type IdeaBatchesRepo = ReturnType<typeof createIdeaBatchesRepo>
