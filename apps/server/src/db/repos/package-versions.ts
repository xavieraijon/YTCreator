import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import {
  type KindVersions,
  PACKAGE_CONTENT_SCHEMAS,
  type PackageContentOf,
  type PackageKind,
  type PackageOrigin,
} from '@ytcreator/core'
import { inTransaction } from '../transaction.ts'

// Every version of each piece of a publishing package: a whole picture each, never changed (research.md R1).
export interface PackageVersion<K extends PackageKind = PackageKind> {
  id: string
  packageId: string
  kind: K
  version: number
  origin: PackageOrigin
  content: PackageContentOf<K>
  draftVersion: number
  mainTitle: string | null
  instructions: string | null
  promptId: string | null
  promptVersion: number | null
  usageId: string | null
  restoredFrom: number | null
  createdAt: string
}

export interface NewPackageVersion<K extends PackageKind> {
  packageId: string
  kind: K
  origin: PackageOrigin
  content: PackageContentOf<K>
  draftVersion: number
  mainTitle?: string | null
  instructions?: string | null
  promptId?: string | null
  promptVersion?: number | null
  usageId?: string | null
  restoredFrom?: number | null
}

interface Row {
  id: string
  package_id: string
  kind: PackageKind
  version: number
  origin: PackageOrigin
  content: string
  draft_version: number
  main_title: string | null
  instructions: string | null
  prompt_id: string | null
  prompt_version: number | null
  usage_id: string | null
  restored_from: number | null
  created_at: string
}

interface SummaryRow {
  version: number
  origin: PackageOrigin
  created_at: string
  restored_from: number | null
}

const orNull = (value: number | null) => (value === null ? null : Number(value))

// The content is validated on the way out: a row that no longer fits its schema must not reach the screen.
const fromRow = <K extends PackageKind>(row: Row): PackageVersion<K> => ({
  id: row.id,
  packageId: row.package_id,
  kind: row.kind as K,
  version: Number(row.version),
  origin: row.origin,
  content: PACKAGE_CONTENT_SCHEMAS[row.kind].parse(JSON.parse(row.content)) as PackageContentOf<K>,
  draftVersion: Number(row.draft_version),
  mainTitle: row.main_title,
  instructions: row.instructions,
  promptId: row.prompt_id,
  promptVersion: orNull(row.prompt_version),
  usageId: row.usage_id,
  restoredFrom: orNull(row.restored_from),
  createdAt: row.created_at,
})

export function createPackageVersionsRepo(db: DatabaseSync, now: () => Date = () => new Date()) {
  const selectLatest = db.prepare(
    'SELECT * FROM package_version WHERE package_id = ? AND kind = ? ORDER BY version DESC LIMIT 1',
  )
  const selectNumber = db.prepare(
    'SELECT MAX(version) AS version FROM package_version WHERE package_id = ? AND kind = ?',
  )
  const selectNumbers = db.prepare(
    'SELECT kind, MAX(version) AS version FROM package_version WHERE package_id = ? GROUP BY kind',
  )
  const selectOne = db.prepare('SELECT * FROM package_version WHERE package_id = ? AND kind = ? AND version = ?')
  const selectSummaries = db.prepare(
    `SELECT version, origin, created_at, restored_from FROM package_version WHERE package_id = ? AND kind = ?
     ORDER BY version DESC`,
  )
  const insert = db.prepare(
    `INSERT INTO package_version (id, package_id, kind, version, origin, content, draft_version, main_title,
       instructions, prompt_id, prompt_version, usage_id, restored_from, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )

  const latest = <K extends PackageKind>(packageId: string, kind: K): PackageVersion<K> | null => {
    const row = selectLatest.get(packageId, kind) as Row | undefined
    return row ? fromRow<K>(row) : null
  }

  const latestNumber = (packageId: string, kind: PackageKind): number | null => {
    const { version } = selectNumber.get(packageId, kind) as { version: number | null }
    return version === null ? null : Number(version)
  }

  return {
    latest,
    latestNumber,

    /** The last version number of each kind; without the content, so a broken row does not stop the state. */
    latestNumbers(packageId: string): KindVersions {
      const rows = selectNumbers.all(packageId) as unknown as { kind: PackageKind; version: number }[]
      return Object.fromEntries(rows.map(({ kind, version }) => [kind, Number(version)]))
    },

    get<K extends PackageKind>(packageId: string, kind: K, version: number): PackageVersion<K> | null {
      const row = selectOne.get(packageId, kind, version) as Row | undefined
      return row ? fromRow<K>(row) : null
    },

    // Without the content: an old row that no longer validates must not stop the list of the others.
    summaries: (packageId: string, kind: PackageKind) =>
      (selectSummaries.all(packageId, kind) as unknown as SummaryRow[]).map((row) => ({
        version: Number(row.version),
        origin: row.origin,
        createdAt: row.created_at,
        restoredFrom: orNull(row.restored_from),
      })),

    add<K extends PackageKind>(version: NewPackageVersion<K>): PackageVersion<K> {
      const content = PACKAGE_CONTENT_SCHEMAS[version.kind].parse(version.content)
      return inTransaction(db, () => {
        const next = (latestNumber(version.packageId, version.kind) ?? 0) + 1
        insert.run(
          randomUUID(),
          version.packageId,
          version.kind,
          next,
          version.origin,
          JSON.stringify(content),
          version.draftVersion,
          version.mainTitle ?? null,
          version.instructions ?? null,
          version.promptId ?? null,
          version.promptVersion ?? null,
          version.usageId ?? null,
          version.restoredFrom ?? null,
          now().toISOString(),
        )
        return latest(version.packageId, version.kind)!
      })
    },
  }
}

export type PackageVersionsRepo = ReturnType<typeof createPackageVersionsRepo>
