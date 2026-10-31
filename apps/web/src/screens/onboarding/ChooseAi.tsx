import { CONNECTION_KINDS, type ConnectionKind } from '@ytcreator/core'
import { Badge, RadioGroup } from '@ytcreator/ui'
import { useRef, useState } from 'react'
import { es } from '../../strings/es.ts'
import styles from './onboarding.module.css'
import { useWizardStep, WizardShell } from './WizardShell.tsx'

// A double click on «Empezar» lands its second click here, on whatever card is under the pointer: a press this
// soon after the screen appears is not the creator's choice. The keyboard is not affected.
const SETTLE_MS = 500

const isKind = (value: string): value is ConnectionKind => (CONNECTION_KINDS as readonly string[]).includes(value)

// FR-013–FR-015: the subscription first and already marked; FR-030: where the ideas go.
export function ChooseAi({ chosenKind }: { chosenKind: ConnectionKind | null }) {
  const [kind, setKind] = useState<ConnectionKind>(chosenKind ?? 'suscripcion')
  const { pending, error, send } = useWizardStep()
  const { options } = es.choose
  const shownAt = useRef(performance.now())
  const tooSoon = useRef(false)

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
      <div
        onPointerDownCapture={() => {
          tooSoon.current = performance.now() - shownAt.current < SETTLE_MS
        }}
        onKeyDownCapture={() => {
          tooSoon.current = false
        }}
      >
        <RadioGroup
          label={es.choose.title}
          hideLabel
          appearance="cards"
          value={kind}
          onValueChange={(value) => {
            if (tooSoon.current) tooSoon.current = false
            else if (isKind(value)) setKind(value)
          }}
          options={[
            {
              value: 'suscripcion',
              label: options.suscripcion.title,
              description: options.suscripcion.body,
              extra: (
                <div className={styles.optionNote}>
                  <div className={styles.tags}>
                    <Badge tone="accent">{options.suscripcion.recommended}</Badge>
                    <Badge tone="warning">{options.suscripcion.responsibility}</Badge>
                  </div>
                  <p>{options.suscripcion.responsibilityHelp}</p>
                </div>
              ),
            },
            { value: 'pago_por_uso', label: options.pago_por_uso.title, description: options.pago_por_uso.body },
          ]}
        />
      </div>
      <p className={styles.text}>{es.wizard.privacy}</p>
    </WizardShell>
  )
}
