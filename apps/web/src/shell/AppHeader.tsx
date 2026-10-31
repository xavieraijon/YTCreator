import { shutdownResponseSchema } from '@ytcreator/core/api'
import { Badge, Button, Dialog, ErrorMessage, Icon, Logo, type BadgeTone } from '@ytcreator/ui'
import { Power, Settings } from 'lucide-react'
import { useState } from 'react'
import { kindLabel } from '../ai/kindLabel.ts'
import { useAiOverview } from '../ai/useAiOverview.ts'
import { apiClient } from '../api/client.ts'
import { es } from '../strings/es.ts'
import styles from './AppHeader.module.css'
import { errorText } from './errorText.ts'
import { Link } from './Link.tsx'
import { statusText } from './statusText.ts'

export interface AppHeaderProps {
  /** During the wizard only the logo and «Cerrar YTCreator» are shown. */
  readonly inWizard?: boolean
  /** Once the server has stopped only the logo is left: there is nothing to go to. */
  readonly closed?: boolean
  /** Called after `POST /api/app/shutdown` answers; App then shows the final screen (FR-006). */
  readonly onClosed: () => void
}

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
        {!inWizard && <AiBadge />}
        {!inWizard && (
          <Link className={styles.link} to={{ page: 'settings' }}>
            <Icon icon={Settings} />
            <span className={styles.label}>{es.header.settings}</span>
          </Link>
        )}
        <CloseApp onClosed={onClosed} />
      </div>
    </header>
  )
}

// The AI in use and how it is doing; it leads to the AI settings.
function AiBadge() {
  const overview = useAiOverview()
  if (!overview) return null
  const active = overview.connections.find((c) => c.isActive)
  const text = active ? `${kindLabel(active.kind)} · ${statusText(active)}` : es.header.noAi
  const tone: BadgeTone = !active
    ? 'warning'
    : active.status === 'conectada'
      ? 'success'
      : active.status === 'sin_comprobar'
        ? 'neutral'
        : 'warning'
  return (
    <Link className={styles.badge} to={{ page: 'aiSettings' }}>
      <Badge tone={tone}>{text}</Badge>
    </Link>
  )
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
        <span className={styles.label}>{es.header.close}</span>
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
