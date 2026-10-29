import type { ConnectionStatus } from '@ytcreator/core'
import type { ConnectionView } from '@ytcreator/core/api'
import { Icon } from '@ytcreator/ui'
import { CircleAlert, CircleCheck, CircleDashed, Clock, ShieldAlert, type LucideIcon } from 'lucide-react'
import styles from './StatusLine.module.css'
import { statusText } from './statusText.ts'

const ICONS: Record<ConnectionStatus, LucideIcon> = {
  conectada: CircleCheck,
  sin_comprobar: CircleDashed,
  sin_sesion: CircleAlert,
  cupo_agotado: Clock,
  tiempo_agotado: Clock,
  contenido_filtrado: ShieldAlert,
  no_disponible: CircleAlert,
}

// The state of an option or an account: text and icon, never colour alone (contracts/ui-screens.md).
export function StatusLine({ view }: { view: Pick<ConnectionView, 'status' | 'reason' | 'resetsAt'> }) {
  return (
    <span className={styles.status}>
      <Icon icon={ICONS[view.status]} size="sm" />
      {statusText(view)}
    </span>
  )
}
