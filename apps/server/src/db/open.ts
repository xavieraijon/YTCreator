import { DatabaseSync } from 'node:sqlite'

// node:sqlite ships with Node 24: no native dependency to build on the creator's machine (R7).
export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  return db
}
