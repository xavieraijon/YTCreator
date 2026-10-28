import type { AiFailure } from '../ai/failures.ts'
import type { Secret } from './secret.ts'

export type SecretStoreKind = 'keychain' | 'secret-service' | 'file'

// Failures are no_disponible / llavero_no_disponible.
export type StoreResult<T> = { ok: true; value: T } | { ok: false; failure: AiFailure }

export interface SecretStore {
  readonly kind: SecretStoreKind
  set(ref: string, secret: Secret): Promise<StoreResult<void>>
  get(ref: string): Promise<StoreResult<Secret | null>>
  delete(ref: string): Promise<StoreResult<void>>
}

// `ytcreator:<type>:<id>`, e.g. `ytcreator:pago_por_uso:anthropic` or `ytcreator:cuenta:<uuid>`.
// It never contains the creator's data.
export function secretRef(type: string, id: string): string {
  return `ytcreator:${type}:${id}`
}

export const STORE_UNAVAILABLE: AiFailure = { kind: 'no_disponible', reason: 'llavero_no_disponible' }
