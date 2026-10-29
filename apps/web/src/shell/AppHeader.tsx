import { shutdownResponseSchema } from '@ytcreator/core/api'
import { Button, Dialog, ErrorMessage, Icon, Logo } from '@ytcreator/ui'
import { Power, Settings } from 'lucide-react'
import { useState } from 'react'
import { apiClient, ApiClientError } from '../api/client.ts'
import { es } from '../strings/es.ts'
import styles from './AppHeader.module.css'
import { Link } from './Link.tsx'

export interface AppHeaderProps {
  /** During the wizard only the logo and «Cerrar YTCreator» are shown. */
  readonly inWizard?: boolean
  /** Once the server has stopped only the logo is left: there is nothing to go to. */
  readonly closed?: boolean
  /** Called after `POST /api/app/shutdown` answers; App then shows the final screen (FR-006). */
  readonly onClosed: () => void
}

// The AI badge arrives with US2 (T104).
export function AppHeader({ inWizard = false, closed = false, onClosed }: AppHeaderProps) {
  if (closed) {
    return (
      <header className={styles.header}>
        <Logo />
      </header>
    )
  }

  return (
    <header className={styles.header}>
      {inWizard ? (
        <Logo />
      ) : (
        <Link className={styles.brand} to={{ page: 'home' }}>
          <Logo />
        </Link>
      )}
      <div className={styles.actions}>
        {!inWizard && (
          <Link className={styles.link} to={{ page: 'settings' }}>
            <Icon icon={Settings} />
            {es.header.settings}
          </Link>
        )}
        <CloseApp onClosed={onClosed} />
      </div>
    </header>
  )
}

function errorText(error: unknown): string {
  if (error instanceof ApiClientError && error.body) return es.apiError[error.body.code]
  if (error instanceof ApiClientError && error.kind === 'red') return es.clientError.red
  return es.clientError.respuesta
}

function CloseApp({ onClosed }: { onClosed: () => void }) {
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = async () => {
    setClosing(true)
    setError(null)
    try {
      await apiClient.post('/api/app/shutdown', {}, shutdownResponseSchema)
      setOpen(false)
      onClosed()
    } catch (caught) {
      setError(errorText(caught))
    } finally {
      setClosing(false)
    }
  }

  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (!next) setError(null)
  }

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        <Icon icon={Power} />
        {es.header.close}
      </Button>
      <Dialog
        open={open}
        onOpenChange={changeOpen}
        title={es.header.closeTitle}
        description={es.header.closeBody}
        size="sm"
        footer={
          <>
            <Button onClick={() => changeOpen(false)}>{es.header.closeCancel}</Button>
            <Button variant="primary" loading={closing} onClick={() => void close()}>
              {es.header.closeConfirm}
            </Button>
          </>
        }
      >
        {error && (
          <ErrorMessage live title={error} action={{ label: es.header.closeRetry, onClick: () => void close() }} />
        )}
      </Dialog>
    </>
  )
}
