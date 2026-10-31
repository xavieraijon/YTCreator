import { randomUUID } from 'node:crypto'
import { type Logger, Secret, type SecretStore, type SecretStoreKind } from '@ytcreator/core'
import type { SettingsRepo } from '../db/repos/settings.ts'
import { createFileStore } from './file-store.ts'
import { createLinuxSecretService } from './linux-secret-service.ts'
import { createMacosKeychain } from './macos-keychain.ts'
import type { ToolOptions } from './run.ts'

// The Secret Service only counts as available if a store-read-clear round trip ends in time (contracts/secrets.md).
const PROBE_TIMEOUT_MS = 3_000

export interface SelectOptions {
  platform: NodeJS.Platform
  settings: SettingsRepo
  logger: Logger
  // APP_HOME/secrets, for the file store.
  fileDir: string
  tools?: ToolOptions
  probeTimeoutMs?: number
}

async function probe(store: SecretStore, timeoutMs: number): Promise<boolean> {
  const ref = `ytcreator:prueba:${randomUUID()}`
  const roundTrip = async () => {
    const value = randomUUID()
    if (!(await store.set(ref, Secret.from(value))).ok) return false
    const read = await store.get(ref)
    const deleted = await store.delete(ref)
    return read.ok && read.value?.reveal() === value && deleted.ok
  }
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<false>((resolve) => (timer = setTimeout(() => resolve(false), timeoutMs)))
  try {
    return await Promise.race([roundTrip(), timeout])
  } finally {
    clearTimeout(timer)
  }
}

// Picks the store once and writes it down in `secret_store`. From then on it always returns that one: if it stops
// working its operations fail with llavero_no_disponible, and secrets never move to another store silently.
export async function selectSecretStore(options: SelectOptions): Promise<SecretStore> {
  const { platform, settings, logger, fileDir, tools, probeTimeoutMs = PROBE_TIMEOUT_MS } = options
  const build: Record<SecretStoreKind, () => SecretStore> = {
    keychain: () => createMacosKeychain(logger, tools),
    'secret-service': () => createLinuxSecretService(logger, tools),
    file: () => createFileStore(fileDir, logger),
  }

  const chosen = settings.get('secret_store')
  if (chosen) return build[chosen]()

  let kind: SecretStoreKind = 'file'
  if (platform === 'darwin') kind = 'keychain'
  else if (
    platform === 'linux' &&
    (await probe(createLinuxSecretService(logger, { ...tools, timeoutMs: probeTimeoutMs }), probeTimeoutMs))
  ) {
    kind = 'secret-service'
  }
  settings.set('secret_store', kind)
  logger.info('secrets.store_selected', { kind })
  return build[kind]()
}
