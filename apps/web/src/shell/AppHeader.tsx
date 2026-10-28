import { Icon, Logo } from '@ytcreator/ui'
import { Settings } from 'lucide-react'
import { es } from '../strings/es.ts'
import styles from './AppHeader.module.css'
import { Link } from './Link.tsx'

export interface AppHeaderProps {
  /** During the wizard only the logo (and, from US1, «Cerrar YTCreator») is shown. */
  readonly inWizard?: boolean
}

// Base header (T053). The AI badge and «Cerrar YTCreator» arrive with US1/US2.
export function AppHeader({ inWizard = false }: AppHeaderProps) {
  return (
    <header className={styles.header}>
      {inWizard ? (
        <Logo />
      ) : (
        <Link className={styles.brand} to={{ page: 'home' }}>
          <Logo />
        </Link>
      )}
      {!inWizard && (
        <div className={styles.actions}>
          <Link className={styles.link} to={{ page: 'settings' }}>
            <Icon icon={Settings} />
            {es.header.settings}
          </Link>
        </div>
      )}
    </header>
  )
}
