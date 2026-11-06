import type { Secret } from '@ytcreator/core'
import type { KeyCheck } from './check-key.ts'

// The key check of tests and e2e: no network. A key that says «-bad-» is refused, one that says «-down-» finds Google
// unreachable. It keeps only the hint of what it was asked, never the key. It lives here because only the Data API
// adapter may read a key (eslint, `reveal`); the registry hands it out only where the fake YouTube is allowed.
export function createFakeKeyCheck() {
  const checked: string[] = []
  const check = async (key: Secret): Promise<KeyCheck> => {
    checked.push(key.hint())
    const text = key.reveal()
    if (text.includes('-bad-')) return { ok: false, failure: 'rechazada' }
    if (text.includes('-down-')) return { ok: false, failure: 'no_disponible' }
    return { ok: true }
  }
  return Object.assign(check, { checked })
}
