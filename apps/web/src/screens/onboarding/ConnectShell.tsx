import type { ConnectionKind } from '@ytcreator/core'
import { Button, ErrorMessage } from '@ytcreator/ui'
import type { ReactNode } from 'react'
import { Screen } from '../../shell/Screen.tsx'
import { es } from '../../strings/es.ts'
import styles from './onboarding.module.css'
import { WizardShell, type PrimaryAction, type StepError } from './WizardShell.tsx'

// The connection screens outside the wizard (/ajustes/ia/cambiar/:kind): «Usar esta opción» instead of
// «Continuar», «Volver» goes back to Ajustes and onboarding_state is never touched.
export interface OutsideWizard {
  readonly finish: PrimaryAction
  readonly back: () => void
  readonly error: string | null
}

export interface ConnectShellProps {
  readonly title: string
  readonly chosenKind: ConnectionKind | null
  readonly outside?: OutsideWizard
  readonly stepError?: StepError | null
  readonly primary?: PrimaryAction
  readonly children?: ReactNode
}

export function ConnectShell({ title, chosenKind, outside, stepError, primary, children }: ConnectShellProps) {
  if (!outside) {
    return (
      <WizardShell step="conectar" title={title} chosenKind={chosenKind} later stepError={stepError} primary={primary}>
        {children}
      </WizardShell>
    )
  }
  return (
    <Screen title={title}>
      {children}
      {outside.error && (
        <ErrorMessage live title={outside.error} action={{ label: es.app.retry, onClick: outside.finish.onClick }} />
      )}
      <div className={styles.actions}>
        <Button variant="ghost" onClick={outside.back}>
          {es.wizard.back}
        </Button>
        {primary && (
          <Button className={styles.primary} variant="primary" loading={primary.loading} onClick={primary.onClick}>
            {primary.label}
          </Button>
        )}
      </div>
    </Screen>
  )
}
