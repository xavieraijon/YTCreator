import type { DatabaseSync } from 'node:sqlite'

// Runs `work` in one transaction; nested calls join the outer one (node:sqlite reports it with isTransaction).
export function inTransaction<T>(db: DatabaseSync, work: () => T): T {
  if (db.isTransaction) return work()
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = work()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
