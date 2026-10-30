import { Button, TextField } from '@ytcreator/ui'
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
}

// The code Claude shows after approving the access; shared by the wizard and the account list in Ajustes.
export function LoginCodeForm({ url, code, onCodeChange, onSubmit, onNewLink, starting = false }: LoginCodeFormProps) {
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
        label={es.connectSubscription.codeLabel}
        autoComplete="off"
        spellCheck={false}
        value={code}
        onChange={(event) => onCodeChange(event.target.value)}
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
