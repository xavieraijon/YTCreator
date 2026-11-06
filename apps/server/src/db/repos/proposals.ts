import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { ProposalKind, ProposalStatus } from '@ytcreator/core'
import { inTransaction } from '../transaction.ts'

export interface Proposal {
  id: string
  journeyId: string
  kind: ProposalKind
  payload: unknown
  editedPayload: unknown
  selectedIndex: number | null
  status: ProposalStatus
  parentId: string | null
  instructions: string | null
  promptId: string
  promptVersion: number
  claimsTrimmed: boolean
  usageId: string | null
  createdAt: string
  decidedAt: string | null
}

export interface NewProposal {
  journeyId: string
  kind: ProposalKind
  payload: unknown
  promptId: string
  promptVersion: number
  instructions?: string | null
  claimsTrimmed?: boolean
  usageId?: string | null
}

interface Row {
  id: string
  journey_id: string
  kind: ProposalKind
  payload: string
  edited_payload: string | null
  selected_index: number | null
  status: ProposalStatus
  parent_id: string | null
  instructions: string | null
  prompt_id: string
  prompt_version: number
  claims_trimmed: number
  usage_id: string | null
  created_at: string
  decided_at: string | null
}

const fromRow = (row: Row): Proposal => ({
  id: row.id,
  journeyId: row.journey_id,
  kind: row.kind,
  payload: JSON.parse(row.payload),
  editedPayload: row.edited_payload === null ? null : JSON.parse(row.edited_payload),
  selectedIndex: row.selected_index,
  status: row.status,
  parentId: row.parent_id,
  instructions: row.instructions,
  promptId: row.prompt_id,
  promptVersion: row.prompt_version,
  claimsTrimmed: row.claims_trimmed === 1,
  usageId: row.usage_id,
  createdAt: row.created_at,
  decidedAt: row.decided_at,
})

export function createProposalsRepo(db: DatabaseSync, now: () => Date = () => new Date()) {
  const selectOne = db.prepare('SELECT * FROM proposal WHERE id = ?')
  const selectByKind = db.prepare('SELECT * FROM proposal WHERE journey_id = ? AND kind = ? ORDER BY created_at, rowid')
  const selectAll = db.prepare('SELECT * FROM proposal WHERE journey_id = ? ORDER BY created_at, rowid')
  const insert = db.prepare(
    `INSERT INTO proposal (id, journey_id, kind, payload, parent_id, instructions, prompt_id, prompt_version,
       claims_trimmed, usage_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const setDecision = db.prepare('UPDATE proposal SET status = ?, selected_index = ?, decided_at = ? WHERE id = ?')
  const setEdited = db.prepare('UPDATE proposal SET edited_payload = ? WHERE id = ?')

  const get = (id: string): Proposal | null => {
    const row = selectOne.get(id) as Row | undefined
    return row ? fromRow(row) : null
  }
  const list = (journeyId: string, kind?: ProposalKind): Proposal[] =>
    ((kind ? selectByKind.all(journeyId, kind) : selectAll.all(journeyId)) as unknown as Row[]).map(fromRow)

  // The next batch, in the order they were asked for, that was left by going back: every one paid for can be reached
  // again, also one that was left when another was asked for from an older batch (P3, entry 150).
  const newer = (id: string, readable: (p: Proposal) => boolean = () => true): Proposal | null => {
    const all = (() => {
      const current = get(id)
      return current ? list(current.journeyId, current.kind) : []
    })()
    const at = all.findIndex((p) => p.id === id)
    if (at < 0) return null
    return all.slice(at + 1).find((p) => p.status === 'descartada' && p.parentId !== null && readable(p)) ?? null
  }

  const insertOne = (proposal: NewProposal, parentId: string | null): Proposal => {
    const id = randomUUID()
    insert.run(
      id,
      proposal.journeyId,
      proposal.kind,
      JSON.stringify(proposal.payload),
      parentId,
      proposal.instructions ?? null,
      proposal.promptId,
      proposal.promptVersion,
      proposal.claimsTrimmed ? 1 : 0,
      proposal.usageId ?? null,
      now().toISOString(),
    )
    return get(id)!
  }

  return {
    get,
    list,
    // The newest proposal of a kind that is not discarded.
    latest(journeyId: string, kind: ProposalKind): Proposal | null {
      return (
        list(journeyId, kind)
          .filter((p) => p.status !== 'descartada')
          .at(-1) ?? null
      )
    },
    create(proposal: NewProposal): Proposal {
      return insertOne(proposal, null)
    },

    // «Proponer otra»: the old one is discarded and the new one points to it.
    // Null if the batch it comes from is no longer in use: the creator moved to another while the AI answered, and
    // keeping this one too would leave two in use (P3, entry 150).
    regenerate(parentId: string, proposal: NewProposal): Proposal | null {
      return inTransaction(db, () => {
        if (get(parentId)?.status === 'descartada') return null
        setDecision.run('descartada', null, now().toISOString(), parentId)
        return insertOne(proposal, parentId)
      })
    },

    // «Volver a la tanda anterior»: this one is discarded and the one it replaced can be chosen again (US1 AS5).
    goBack(id: string): Proposal | null {
      const current = get(id)
      if (!current?.parentId) return null
      return inTransaction(db, () => {
        setDecision.run('descartada', null, now().toISOString(), id)
        setDecision.run('propuesta', null, now().toISOString(), current.parentId)
        return get(current.parentId!)
      })
    },

    newer,

    // «Volver a la tanda más nueva»: the opposite of goBack. Both batches stay; only which one is in use changes (P3).
    goForward(id: string, readable?: (p: Proposal) => boolean): Proposal | null {
      const current = get(id)
      if (!current || current.status === 'descartada') return null
      const next = newer(id, readable)
      if (!next) return null
      return inTransaction(db, () => {
        setDecision.run('descartada', null, now().toISOString(), id)
        setDecision.run('propuesta', null, now().toISOString(), next.id)
        return get(next.id)
      })
    },

    approve(id: string, selectedIndex: number | null = null): Proposal | null {
      setDecision.run('aprobada', selectedIndex, now().toISOString(), id)
      return get(id)
    },

    discard(id: string): Proposal | null {
      setDecision.run('descartada', null, now().toISOString(), id)
      return get(id)
    },

    edit(id: string, editedPayload: unknown): Proposal | null {
      setEdited.run(JSON.stringify(editedPayload), id)
      return get(id)
    },
  }
}

export type ProposalsRepo = ReturnType<typeof createProposalsRepo>
