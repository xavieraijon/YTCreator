import type { ConnectionKind } from '@ytcreator/core'
import { es } from '../strings/es.ts'

// The registry's `labelKey` (ai.provider.*) of each connection kind.
const providerOf = { suscripcion: 'claude_code', pago_por_uso: 'anthropic' } as const satisfies Record<
  ConnectionKind,
  keyof typeof es.ai.provider
>

export const kindLabel = (kind: ConnectionKind): string => es.ai.provider[providerOf[kind]]
