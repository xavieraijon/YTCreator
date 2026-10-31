import { randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { type Logger, STORE_UNAVAILABLE, Secret, type SecretStore, type StoreResult } from '@ytcreator/core'

const FILE = 'secrets.json'

// Fallback when there is no keychain (R8): APP_HOME/secrets/secrets.json, 0600 inside a 0700 folder.
// `dir` is always APP_HOME/secrets, never the workspace (FR-028b).
export function createFileStore(dir: string, logger: Logger): SecretStore {
  const path = join(dir, FILE)
  // Writes are read-modify-write: they run one after another.
  let queue: Promise<unknown> = Promise.resolve()

  async function tighten(target: string, wanted: number) {
    const current = (await stat(target)).mode & 0o777
    if ((current & ~wanted) !== 0) {
      await chmod(target, wanted)
      logger.warn('secrets.permissions_fixed', { file: target === dir ? 'folder' : 'file' })
    }
  }

  async function load(): Promise<Record<string, string>> {
    await mkdir(dir, { recursive: true, mode: 0o700 })
    await tighten(dir, 0o700)
    try {
      await tighten(path, 0o600)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
      throw error
    }
    return JSON.parse(await readFile(path, 'utf8')) as Record<string, string>
  }

  async function save(values: Record<string, string>) {
    const temp = join(dir, `.${FILE}.${randomUUID()}.tmp`)
    try {
      await writeFile(temp, JSON.stringify(values), { mode: 0o600, flag: 'wx' })
      await rename(temp, path)
    } finally {
      await rm(temp, { force: true })
    }
  }

  async function guarded<T>(operation: string, run: () => Promise<T>): Promise<StoreResult<T>> {
    try {
      return { ok: true, value: await run() }
    } catch (error) {
      logger.warn('secrets.file_store_failed', { operation, errno: (error as NodeJS.ErrnoException).code ?? null })
      return { ok: false, failure: STORE_UNAVAILABLE }
    }
  }

  function serial<T>(run: () => Promise<T>): Promise<T> {
    const next = queue.then(run, run)
    queue = next.catch(() => undefined)
    return next
  }

  return {
    kind: 'file',
    set: (ref, secret) =>
      guarded('set', () =>
        serial(async () => {
          const values = await load()
          values[ref] = secret.reveal()
          await save(values)
        }),
      ),
    get: (ref) =>
      guarded('get', () =>
        serial(async () => {
          const value = (await load())[ref]
          return value === undefined ? null : Secret.from(value)
        }),
      ),
    delete: (ref) =>
      guarded('delete', () =>
        serial(async () => {
          const values = await load()
          if (!(ref in values)) return
          delete values[ref]
          await save(values)
        }),
      ),
  }
}
