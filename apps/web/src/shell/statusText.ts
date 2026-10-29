import type { AiFailure } from '@ytcreator/core'
import type { ConnectionView } from '@ytcreator/core/api'
import { format } from '@ytcreator/ui'
import { es } from '../strings/es.ts'
import { failuresEs, type FailureText } from '../strings/failures.es.ts'

export function failureText(failure: Pick<AiFailure, 'kind' | 'reason'>): FailureText {
  return (
    (failuresEs[failure.kind] as Record<string, FailureText>)[failure.reason] ?? failuresEs.no_disponible.servicio_caido
  )
}

// Dates in the browser's time zone (contracts/ui-screens.md).
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso))
}

type StatusFields = Pick<ConnectionView, 'status' | 'reason' | 'resetsAt'>

// «Funciona», «Sin cupo hasta el …»: the short state next to an option or an account.
export function statusText({ status, reason, resetsAt }: StatusFields): string {
  if (status === 'conectada' || status === 'sin_comprobar') return es.status[status]
  if (!reason) return es.status.sin_comprobar
  const text = failureText({ kind: status, reason } as AiFailure)
  return resetsAt && text.statusUntil ? format(text.statusUntil, { fecha: formatDate(resetsAt) }) : text.status
}
