import type { ConnectionKind } from '@ytcreator/core'
import type { WizardAction } from '@ytcreator/core/api'
import { Button, ErrorMessage, Stepper } from '@ytcreator/ui'
import { useCallback, useState, type ReactNode } from 'react'
import { isConflict, sendStep } from '../../onboarding/useOnboarding.ts'
import { WIZARD_STEPS, type WizardStep } from '../../router.ts'
import { errorText } from '../../shell/errorText.ts'
import { Screen } from '../../shell/Screen.tsx'
import { es } from '../../strings/es.ts'
import styles from './onboarding.module.css'

// Sends a wizard step and keeps the text of a refusal. A conflict shows nothing: App moves to the real step.
export interface StepError {
  readonly text: string
  readonly retry: () => void
}

export function useWizardStep() {
  const [pending, setPending] = useState<WizardAction | null>(null)
  const [error, setError] = useState<StepError | null>(null)

  const send = useCallback(async (action: WizardAction, kind?: ConnectionKind): Promise<boolean> => {
    setPending(action)
    setError(null)
    const result = await sendStep(action, kind)
    setPending(null)
    if (!result.ok && !isConflict(result.error)) {
      setError({ text: errorText(result.error), retry: () => void send(action, kind) })
    }
    return result.ok
  }, [])

  return { pending, error, send }
}

export interface PrimaryAction {
  readonly label: string
  readonly onClick: () => void
  readonly loading?: boolean
}

export interface WizardShellProps {
  readonly step: WizardStep
  readonly title: string
  readonly chosenKind: ConnectionKind | null
  readonly children?: ReactNode
  /** The single main action; a screen showing a failure may leave it to the failure's own button. */
  readonly primary?: PrimaryAction
  /** «Volver» (every step) and «Lo haré más tarde» (elegir and conectar). */
  readonly back?: boolean
  readonly later?: boolean
  /** A refused step of the screen's own (its `useWizardStep`). */
  readonly stepError?: StepError | null
}

export function WizardShell({
  step,
  title,
  chosenKind,
  children,
  primary,
  back = true,
  later = false,
  stepError = null,
}: WizardShellProps) {
  const shell = useWizardStep()
  const { pending, send } = shell
  const error = shell.error ?? stepError
  const steps = WIZARD_STEPS.map((id) => ({
    id,
    label:
      id === 'limites' && chosenKind === 'suscripcion'
        ? `${es.wizard.steps.limites} (${es.wizard.notNeeded})`
        : es.wizard.steps[id],
  }))

  return (
    <Screen title={title} before={<Stepper steps={steps} current={WIZARD_STEPS.indexOf(step) + 1} />}>
      {children}
      {error && <ErrorMessage live title={error.text} action={{ label: es.app.retry, onClick: error.retry }} />}
      <div className={styles.actions}>
        {back && (
          <Button variant="ghost" loading={pending === 'volver'} onClick={() => void send('volver')}>
            {es.wizard.back}
          </Button>
        )}
        {later && (
          <Button variant="ghost" loading={pending === 'aplazar'} onClick={() => void send('aplazar')}>
            {es.wizard.later}
          </Button>
        )}
        {primary && (
          <Button className={styles.primary} variant="primary" loading={primary.loading} onClick={primary.onClick}>
            {primary.label}
          </Button>
        )}
      </div>
    </Screen>
  )
}
