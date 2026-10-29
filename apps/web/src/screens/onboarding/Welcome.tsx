import { Button, ErrorMessage } from '@ytcreator/ui'
import { links } from '../../links.ts'
import { ExternalLink } from '../../shell/ExternalLink.tsx'
import { Screen } from '../../shell/Screen.tsx'
import { es } from '../../strings/es.ts'
import styles from './onboarding.module.css'
import { useWizardStep } from './WizardShell.tsx'

// FR-018: what YTCreator does, what comes next and what the creator needs. It does not count as a wizard step.
export function Welcome() {
  const { pending, error, send } = useWizardStep()

  return (
    <Screen title={es.welcome.title}>
      <p>{es.welcome.intro}</p>
      <p>{es.welcome.next}</p>
      <div className={styles.stack}>
        <p className={styles.text}>{es.welcome.needs}</p>
        <div className={styles.links}>
          <ExternalLink className={styles.link} href={links.claudePlans}>
            {es.welcome.subscriptionLink}
          </ExternalLink>
          <ExternalLink className={styles.link} href={links.anthropicConsole}>
            {es.welcome.apiLink}
          </ExternalLink>
        </div>
      </div>
      {error && <ErrorMessage live title={error.text} action={{ label: es.app.retry, onClick: error.retry }} />}
      <div className={styles.actions}>
        <Button
          className={styles.primary}
          variant="primary"
          loading={pending === 'continuar'}
          onClick={() => void send('continuar')}
        >
          {es.welcome.start}
        </Button>
      </div>
    </Screen>
  )
}
