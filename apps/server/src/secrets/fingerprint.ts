import { createHash } from 'node:crypto'
import type { Secret } from '@ytcreator/core'

// The account fingerprint: SHA-256 of the token, since Claude gives no account identity (spike S3).
export function secretFingerprint(secret: Secret): string {
  return createHash('sha256').update(secret.reveal()).digest('hex')
}
