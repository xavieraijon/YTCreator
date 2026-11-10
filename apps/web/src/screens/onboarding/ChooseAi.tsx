import { CONNECTION_KINDS, type ConnectionKind } from '@ytcreator/core'
import { Badge, Button, RadioGroup } from '@ytcreator/ui'
import { useEffect, useRef, useState } from 'react'
import { es } from '../../strings/es.ts'
import styles from './onboarding.module.css'
import { useWizardStep, WizardShell } from './WizardShell.tsx'

// A double click on «Empezar» lands its second click here, on whatever card is under the pointer: a press this
// soon after the screen appears is not the creator's choice. The keyboard is not affected.
const SETTLE_MS = 500

const isKind = (value: string): value is ConnectionKind => (CONNECTION_KINDS as readonly string[]).includes(value)

// FR-013–FR-015: the subscription first and already marked; FR-030: where the ideas go. Paying per use is a secondary
// option behind «Más opciones» (decision 1 of 002), shown at once if it was the one chosen.
export function ChooseAi({ chosenKind }: { chosenKind: ConnectionKind | null }) {
  const [kind, setKind] = useState<ConnectionKind>(chosenKind ?? 'suscripcion')
  const [more, setMore] = useState(chosenKind === 'pago_por_uso')
  const options$ = useRef<HTMLDivElement>(null)
  const opened = useRef(false)
  // The button goes once used: the focus moves to the choice, not to the top of the page.
  useEffect(() => {
    if (!more || !opened.current) return
    options$.current?.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.focus()
  }, [more])
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
        ref={options$}
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
            ...(more
              ? [{ value: 'pago_por_uso', label: options.pago_por_uso.title, description: options.pago_por_uso.body }]
              : []),
          ]}
        />
        {!more && (
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={false}
            onClick={() => {
              opened.current = true
              setMore(true)
            }}
          >
            {es.choose.more}
          </Button>
        )}
      </div>
      <p className={styles.text}>{es.wizard.privacy}</p>
    </WizardShell>
  )
}
