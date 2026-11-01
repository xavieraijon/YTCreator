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
  const selectByKind = db.prepare(
    'SELECT * FROM proposal WHERE journey_id = ? AND kind = ? ORDER BY created_at, rowid',
  )
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
      return list(journeyId, kind).filter((p) => p.status !== 'descartada').at(-1) ?? null
    },
    create(proposal: NewProposal): Proposal {
      return insertOne(proposal, null)
    },

    // «Proponer otra»: the old one is discarded and the new one points to it.
    regenerate(parentId: string, proposal: NewProposal): Proposal {
      return inTransaction(db, () => {
        setDecision.run('descartada', null, now().toISOString(), parentId)
        return insertOne(proposal, parentId)
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
