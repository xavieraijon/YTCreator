import type { ConnectionKind } from '@ytcreator/core'
import { es } from '../../strings/es.ts'
import { LimitsForm, useLimitsForm } from '../settings/LimitsForm.tsx'
import styles from './onboarding.module.css'
import { useWizardStep, WizardShell } from './WizardShell.tsx'

// FR-021, FR-022: pago_por_uso only becomes active once the creator accepts (or changes) these limits.
export function Limits({ chosenKind }: { chosenKind: ConnectionKind | null }) {
  const form = useLimitsForm()
  const step = useWizardStep()

  const accept = async () => {
    if (await form.save()) await step.send('continuar')
  }

  return (
    <WizardShell
      step="limites"
      title={es.limits.title}
      chosenKind={chosenKind}
      stepError={step.error}
      primary={
        form.texts
          ? { label: es.limits.save, onClick: () => void accept(), loading: form.saving || !!step.pending }
          : undefined
      }
    >
      <p className={styles.text}>{es.limits.why}</p>
      {!form.accepted && form.texts && <p className={styles.text}>{es.limits.proposed}</p>}
      <LimitsForm form={form} onSubmit={() => void accept()} />
    </WizardShell>
  )
}
