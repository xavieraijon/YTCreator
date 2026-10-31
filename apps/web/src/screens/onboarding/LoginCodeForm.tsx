import { Button, TextField } from '@ytcreator/ui'
import { useEffect, useRef } from 'react'
import { ExternalLink } from '../../shell/ExternalLink.tsx'
import { es } from '../../strings/es.ts'
import styles from './onboarding.module.css'

export interface LoginCodeFormProps {
  /** Claude's page for this login. */
  readonly url: string
  readonly code: string
  readonly onCodeChange: (code: string) => void
  readonly onSubmit: () => void
  readonly onNewLink: () => void
  readonly starting?: boolean
  /** What is wrong with the code; the field takes the focus to fix it. */
  readonly error?: string | null
}

// The code Claude shows after approving the access; shared by the wizard and the account list in Ajustes.
export function LoginCodeForm({
  url,
  code,
  onCodeChange,
  onSubmit,
  onNewLink,
  starting = false,
  error = null,
}: LoginCodeFormProps) {
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (error) field.current?.focus()
  }, [error])

  return (
    <form
      className={styles.stack}
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <p className={styles.text}>
        {es.connectSubscription.codeHelp}{' '}
        <ExternalLink className={styles.link} href={url}>
          {es.connectSubscription.reopenPage}
        </ExternalLink>
      </p>
      <TextField
        ref={field}
        label={es.connectSubscription.codeLabel}
        autoComplete="off"
        spellCheck={false}
        value={code}
        onChange={(event) => onCodeChange(event.target.value)}
        error={error ?? undefined}
      />
      {/* A secondary action of its own, never in a row with the link (contracts/ui-screens.md). */}
      <div>
        <Button type="button" variant="secondary" onClick={onNewLink} loading={starting}>
          {es.connectSubscription.newLink}
        </Button>
      </div>
    </form>
  )
}
