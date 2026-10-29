import { EmptyState, ErrorMessage } from '@ytcreator/ui'
import { PlugZap } from 'lucide-react'
import { Screen } from '../../shell/Screen.tsx'
import { es } from '../../strings/es.ts'
import { useWizardStep } from '../onboarding/WizardShell.tsx'

// FR-021: the wizard was postponed. Nothing that needs the AI can be done until the creator comes back to it.
export function ConnectAi() {
  const { error, send } = useWizardStep()

  return (
    <Screen title={es.connectAi.title}>
      <EmptyState
        icon={PlugZap}
        titleAs="h2"
        title={es.connectAi.body}
        action={{ label: es.connectAi.action, onClick: () => void send('retomar') }}
      />
      {error && <ErrorMessage live title={error.text} action={{ label: es.app.retry, onClick: error.retry }} />}
    </Screen>
  )
}
