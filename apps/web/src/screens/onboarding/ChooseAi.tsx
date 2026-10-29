import { CONNECTION_KINDS, type ConnectionKind } from '@ytcreator/core'
import { Badge, IconButton, RadioGroup } from '@ytcreator/ui'
import { Info } from 'lucide-react'
import { useState } from 'react'
import { es } from '../../strings/es.ts'
import styles from './onboarding.module.css'
import { useWizardStep, WizardShell } from './WizardShell.tsx'

const isKind = (value: string): value is ConnectionKind => (CONNECTION_KINDS as readonly string[]).includes(value)

// FR-013–FR-015: the subscription first and already marked; FR-030: where the ideas go.
export function ChooseAi({ chosenKind }: { chosenKind: ConnectionKind | null }) {
  const [kind, setKind] = useState<ConnectionKind>(chosenKind ?? 'suscripcion')
  const { pending, error, send } = useWizardStep()
  const { options } = es.choose

  return (
    <WizardShell
      step="elegir"
      title={es.choose.title}
      chosenKind={chosenKind}
      later
      stepError={error}
      primary={{ label: es.choose.continue, onClick: () => void send('elegir', kind), loading: pending === 'elegir' }}
    >
      <p className={styles.text}>{es.choose.why}</p>
      <RadioGroup
        label={es.choose.title}
        appearance="cards"
        value={kind}
        onValueChange={(value) => isKind(value) && setKind(value)}
        options={[
          { value: 'suscripcion', label: options.suscripcion.title, description: options.suscripcion.body },
          { value: 'pago_por_uso', label: options.pago_por_uso.title, description: options.pago_por_uso.body },
        ]}
      />
      <div className={styles.tags} aria-label={options.suscripcion.title} role="group">
        <Badge tone="accent">{options.suscripcion.recommended}</Badge>
        <Badge tone="warning">{options.suscripcion.responsibility}</Badge>
        <IconButton variant="ghost" size="sm" icon={Info} label={options.suscripcion.responsibilityHelp} />
      </div>
      <p className={styles.text}>{es.wizard.privacy}</p>
    </WizardShell>
  )
}
