import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { IdeaFormat, KindVersions, PackageStep } from '@ytcreator/core'

// The publishing package of each approved script and the publishing settings of each channel
// (specs/006-publishing-package/data-model.md).
export interface PublishPackage {
  id: string
  channelId: string
  scriptId: string
  format: IdeaFormat
  coverApproved: KindVersions | null
  textsApproved: KindVersions | null
  packageApproved: KindVersions | null
  packageApprovedAt: string | null
  packageApprovedWarnings: number | null
  packageApprovedDraft: number | null
  studioDone: string[]
  jobId: string | null
  jobOp: string | null
  createdAt: string
  updatedAt: string
}

export interface PublishSettings {
  fixedText: string
  category: string | null
}

interface Row {
  id: string
  channel_id: string
  script_id: string
  format: IdeaFormat
  cover_approved: string | null
  texts_approved: string | null
  package_approved: string | null
  package_approved_at: string | null
  package_approved_warnings: number | null
  package_approved_draft: number | null
  studio_done: string
  job_id: string | null
  job_op: string | null
  created_at: string
  updated_at: string
}

const orNull = (value: number | null) => (value === null ? null : Number(value))
const versions = (json: string | null) => (json === null ? null : (JSON.parse(json) as KindVersions))

const fromRow = (row: Row): PublishPackage => ({
  id: row.id,
  channelId: row.channel_id,
  scriptId: row.script_id,
  format: row.format,
  coverApproved: versions(row.cover_approved),
  textsApproved: versions(row.texts_approved),
  packageApproved: versions(row.package_approved),
  packageApprovedAt: row.package_approved_at,
  packageApprovedWarnings: orNull(row.package_approved_warnings),
  packageApprovedDraft: orNull(row.package_approved_draft),
  studioDone: JSON.parse(row.studio_done) as string[],
  jobId: row.job_id,
  jobOp: row.job_op,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export function createPackagesRepo(db: DatabaseSync, now: () => Date = () => new Date()) {
  const selectOne = db.prepare('SELECT * FROM publish_package WHERE id = ?')
  const selectByScript = db.prepare('SELECT * FROM publish_package WHERE script_id = ?')
  const selectByChannel = db.prepare(
    'SELECT * FROM publish_package WHERE channel_id = ? ORDER BY updated_at DESC, rowid DESC',
  )
  const insert = db.prepare(
    `INSERT INTO publish_package (id, channel_id, script_id, format, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
  )
  const updateCover = db.prepare('UPDATE publish_package SET cover_approved = ?, updated_at = ? WHERE id = ?')
  const updateTexts = db.prepare('UPDATE publish_package SET texts_approved = ?, updated_at = ? WHERE id = ?')
  const updatePackage = db.prepare(
    `UPDATE publish_package SET package_approved = ?, package_approved_at = ?, package_approved_warnings = ?,
       package_approved_draft = ?, updated_at = ? WHERE id = ?`,
  )
  const updateStudio = db.prepare('UPDATE publish_package SET studio_done = ?, updated_at = ? WHERE id = ?')
  // Asking for something is not a change: a failed attempt must not move «último cambio» or trip the other tab.
  const updateJob = db.prepare('UPDATE publish_package SET job_id = ?, job_op = ? WHERE id = ?')
  const updateTouched = db.prepare('UPDATE publish_package SET updated_at = ? WHERE id = ?')
  const selectSettings = db.prepare('SELECT fixed_text, category FROM channel_publish_settings WHERE channel_id = ?')
  const upsertSettings = db.prepare(
    `INSERT INTO channel_publish_settings (channel_id, fixed_text, category, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (channel_id) DO UPDATE SET fixed_text = excluded.fixed_text, category = excluded.category,
       updated_at = excluded.updated_at`,
  )

  const get = (id: string): PublishPackage | null => {
    const row = selectOne.get(id) as Row | undefined
    return row ? fromRow(row) : null
  }
  const at = () => now().toISOString()

  return {
    get,

    getByScript(scriptId: string): PublishPackage | null {
      const row = selectByScript.get(scriptId) as Row | undefined
      return row ? fromRow(row) : null
    },

    // The last one touched first (FR-002).
    listByChannel: (channelId: string): PublishPackage[] =>
      (selectByChannel.all(channelId) as unknown as Row[]).map(fromRow),

    create(pkg: { channelId: string; scriptId: string; format: IdeaFormat }): PublishPackage {
      const id = randomUUID()
      const when = at()
      insert.run(id, pkg.channelId, pkg.scriptId, pkg.format, when, when)
      return get(id)!
    },

    approveStep(id: string, step: PackageStep, approved: KindVersions): PublishPackage {
      ;(step === 'portada' ? updateCover : updateTexts).run(JSON.stringify(approved), at(), id)
      return get(id)!
    },

    approvePackage(id: string, approved: KindVersions, warnings: number, draftVersion: number): PublishPackage {
      const when = at()
      updatePackage.run(JSON.stringify(approved), when, warnings, draftVersion, when, id)
      return get(id)!
    },

    setStudioDone(id: string, done: string[]): PublishPackage {
      updateStudio.run(JSON.stringify(done), at(), id)
      return get(id)!
    },

    setJob(id: string, jobId: string | null, op: string): void {
      updateJob.run(jobId, op, id)
    },

    touch(id: string): void {
      updateTouched.run(at(), id)
    },

    settings(channelId: string): PublishSettings | null {
      const row = selectSettings.get(channelId) as { fixed_text: string; category: string | null } | undefined
      return row ? { fixedText: row.fixed_text, category: row.category } : null
    },

    saveSettings(channelId: string, settings: PublishSettings): void {
      upsertSettings.run(channelId, settings.fixedText, settings.category, at())
    },
  }
}

export type PackagesRepo = ReturnType<typeof createPackagesRepo>
