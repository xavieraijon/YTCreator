import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { CONTENT_SCHEMAS, type ContentOf, type DraftContent, type ScriptKind, type VersionOrigin } from '@ytcreator/core'
import { inTransaction } from '../transaction.ts'

// Every version of the facts, the outline and the draft of a script: a whole picture each (research.md R1).
export interface ScriptVersion<K extends ScriptKind = ScriptKind> {
  id: string
  scriptId: string
  kind: K
  version: number
  origin: VersionOrigin
  content: ContentOf<K>
  factsVersion: number | null
  outlineVersion: number | null
  ideaRevision: number
  profileVersion: number
  instructions: string | null
  promptId: string | null
  promptVersion: number | null
  usageId: string | null
  restoredFrom: number | null
  createdAt: string
}

export interface NewScriptVersion<K extends ScriptKind> {
  scriptId: string
  kind: K
  origin: VersionOrigin
  content: ContentOf<K>
  factsVersion?: number | null
  outlineVersion?: number | null
  ideaRevision: number
  profileVersion: number
  instructions?: string | null
  promptId?: string | null
  promptVersion?: number | null
  usageId?: string | null
  restoredFrom?: number | null
}

interface Row {
  id: string
  script_id: string
  kind: ScriptKind
  version: number
  origin: VersionOrigin
  content: string
  facts_version: number | null
  outline_version: number | null
  idea_revision: number
  profile_version: number
  instructions: string | null
  prompt_id: string | null
  prompt_version: number | null
  usage_id: string | null
  restored_from: number | null
  created_at: string
}

const orNull = (value: number | null) => (value === null ? null : Number(value))

// The content is validated on the way out: a row that no longer fits its schema must not reach the screen.
const fromRow = <K extends ScriptKind>(row: Row): ScriptVersion<K> => ({
  id: row.id,
  scriptId: row.script_id,
  kind: row.kind as K,
  version: Number(row.version),
  origin: row.origin,
  content: CONTENT_SCHEMAS[row.kind].parse(JSON.parse(row.content)) as ContentOf<K>,
  factsVersion: orNull(row.facts_version),
  outlineVersion: orNull(row.outline_version),
  ideaRevision: Number(row.idea_revision),
  profileVersion: Number(row.profile_version),
  instructions: row.instructions,
  promptId: row.prompt_id,
  promptVersion: orNull(row.prompt_version),
  usageId: row.usage_id,
  restoredFrom: orNull(row.restored_from),
  createdAt: row.created_at,
})

// Only «Es correcto» and «No es un dato» may touch a version that exists, and never its text (R10, principle II).
export class MarksUpdateError extends Error {
  constructor() {
    super('Only the latest unapproved marks version can be updated, and never its text')
    this.name = 'MarksUpdateError'
  }
}

// What a mark may change is its own state and check: the blocks stay whole, and so does what each mark points at.
const onlyMarksChange = (before: DraftContent, after: DraftContent) => {
  const claim = ({ id, blockId, text, reason, factId }: DraftContent['claims'][number]) => ({
    id,
    blockId,
    text,
    reason,
    factId,
  })
  return (
    JSON.stringify(before.blocks) === JSON.stringify(after.blocks) &&
    JSON.stringify(before.claims.map(claim)) === JSON.stringify(after.claims.map(claim))
  )
}

export function createScriptVersionsRepo(db: DatabaseSync, now: () => Date = () => new Date()) {
  const selectLatest = db.prepare(
    'SELECT * FROM script_version WHERE script_id = ? AND kind = ? ORDER BY version DESC LIMIT 1',
  )
  const selectNumber = db.prepare(
    'SELECT MAX(version) AS version FROM script_version WHERE script_id = ? AND kind = ?',
  )
  const selectOne = db.prepare('SELECT * FROM script_version WHERE script_id = ? AND kind = ? AND version = ?')
  const selectAll = db.prepare('SELECT * FROM script_version WHERE script_id = ? AND kind = ? ORDER BY version DESC')
  const insert = db.prepare(
    `INSERT INTO script_version (id, script_id, kind, version, origin, content, facts_version, outline_version,
       idea_revision, profile_version, instructions, prompt_id, prompt_version, usage_id, restored_from, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const updateContent = db.prepare('UPDATE script_version SET content = ? WHERE id = ?')
  const selectApproved = db.prepare('SELECT draft_approved_version AS approved FROM script WHERE id = ?')

  const latest = <K extends ScriptKind>(scriptId: string, kind: K): ScriptVersion<K> | null => {
    const row = selectLatest.get(scriptId, kind) as Row | undefined
    return row ? fromRow<K>(row) : null
  }

  // Only the number: a row that no longer validates must not stop the list, nor the version that replaces it.
  const latestNumber = (scriptId: string, kind: ScriptKind): number | null => {
    const { version } = selectNumber.get(scriptId, kind) as { version: number | null }
    return version === null ? null : Number(version)
  }

  return {
    latest,
    latestNumber,

    get<K extends ScriptKind>(scriptId: string, kind: K, version: number): ScriptVersion<K> | null {
      const row = selectOne.get(scriptId, kind, version) as Row | undefined
      return row ? fromRow<K>(row) : null
    },

    // The newest first.
    list: <K extends ScriptKind>(scriptId: string, kind: K): ScriptVersion<K>[] =>
      (selectAll.all(scriptId, kind) as unknown as Row[]).map((row) => fromRow<K>(row)),

    add<K extends ScriptKind>(version: NewScriptVersion<K>): ScriptVersion<K> {
      const content = CONTENT_SCHEMAS[version.kind].parse(version.content)
      return inTransaction(db, () => {
        const next = (latestNumber(version.scriptId, version.kind) ?? 0) + 1
        insert.run(
          randomUUID(),
          version.scriptId,
          version.kind,
          next,
          version.origin,
          JSON.stringify(content),
          version.factsVersion ?? null,
          version.outlineVersion ?? null,
          version.ideaRevision,
          version.profileVersion,
          version.instructions ?? null,
          version.promptId ?? null,
          version.promptVersion ?? null,
          version.usageId ?? null,
          version.restoredFrom ?? null,
          now().toISOString(),
        )
        return latest(version.scriptId, version.kind)!
      })
    },

    /** Several marks in a row are one line of the history, not forty (R10). */
    updateMarks(scriptId: string, content: DraftContent): ScriptVersion<'guion'> {
      const parsed = CONTENT_SCHEMAS.guion.parse(content)
      return inTransaction(db, () => {
        const current = latest(scriptId, 'guion')
        const approved = selectApproved.get(scriptId) as { approved: number | null } | undefined
        if (
          !current ||
          current.origin !== 'marcas' ||
          (approved?.approved !== null && Number(approved?.approved) === current.version) ||
          !onlyMarksChange(current.content, parsed)
        ) {
          throw new MarksUpdateError()
        }
        updateContent.run(JSON.stringify(parsed), current.id)
        return latest(scriptId, 'guion')!
      })
    },
  }
}

export type ScriptVersionsRepo = ReturnType<typeof createScriptVersionsRepo>
