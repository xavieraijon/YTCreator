import type { ConnectionKind } from '@ytcreator/core'
import { format } from '@ytcreator/ui'
import { kindLabel } from '../../ai/kindLabel.ts'
import { es } from '../../strings/es.ts'
import styles from './onboarding.module.css'
import { useWizardStep, WizardShell } from './WizardShell.tsx'

// The end of the wizard: what the creator uses now, and the way into the app.
export function Done({ chosenKind }: { chosenKind: ConnectionKind | null }) {
  const step = useWizardStep()

  return (
    <WizardShell
      step="listo"
      title={es.done.title}
      chosenKind={chosenKind}
      stepError={step.error}
      primary={{ label: es.done.goHome, onClick: () => void step.send('continuar'), loading: !!step.pending }}
    >
      {chosenKind && <p className={styles.text}>{format(es.done.summary, { opcion: kindLabel(chosenKind) })}</p>}
      {chosenKind === 'suscripcion' && <p className={styles.text}>{es.done.noExtraCost}</p>}
    </WizardShell>
  )
}
