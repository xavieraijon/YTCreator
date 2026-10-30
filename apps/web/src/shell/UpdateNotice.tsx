import { dismissResponseSchema, updateInfoSchema } from '@ytcreator/core/api'
import { Button } from '@ytcreator/ui'
import { useEffect, useState } from 'react'
import { apiClient } from '../api/client.ts'
import { es } from '../strings/es.ts'
import styles from './UpdateNotice.module.css'

// Same line as README.md's install command (R20, R21).
const INSTALL_LINE = 'curl -fsSL https://github.com/xavieraijon/YTCreator/releases/latest/download/install.sh | bash'

// Discreet, non-blocking: only the periodic check already saved decides whether to show it (FR-031).
export function UpdateNotice() {
  const [latest, setLatest] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    void apiClient
      .get('/api/updates', updateInfoSchema)
      .then((info) => setLatest(info.show ? info.latest : null))
      .catch(() => {})
  }, [])

  if (!latest) return null

  const dismiss = () => {
    const version = latest
    setLatest(null)
    void apiClient.post('/api/updates/dismiss', { version }, dismissResponseSchema).catch(() => {})
  }

  const copy = () => {
    void navigator.clipboard
      .writeText(INSTALL_LINE)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {})
  }

  return (
    <div className={styles.notice} role="status">
      <p className={styles.text}>{es.updateNotice.body}</p>
      <code className={styles.line}>{INSTALL_LINE}</code>
      <div className={styles.actions}>
        <Button variant="secondary" onClick={copy}>
          {copied ? es.updateNotice.copied : es.updateNotice.copy}
        </Button>
        <Button variant="ghost" onClick={dismiss}>
          {es.updateNotice.close}
        </Button>
      </div>
    </div>
  )
}
