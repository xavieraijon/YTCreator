import { Check } from 'lucide-react'
import type { ComponentProps } from 'react'
import { Icon } from '../../icons/index.ts'
import { format } from '../../strings/format.ts'
import { useUiStrings } from '../../strings/UiStringsProvider.tsx'
import { cx } from '../../utils/cx.ts'
import styles from './Stepper.module.css'

export interface StepperProps extends Omit<ComponentProps<'div'>, 'children'> {
  readonly steps: readonly { readonly id: string; readonly label: string }[]
  /** Current step, starting at 1. */
  readonly current: number
}

/** Steps of a flow. Each state has a shape and a text, not only a color (FR-011). */
export function Stepper({ steps, current, className, ...rest }: StepperProps) {
  const strings = useUiStrings().stepper
  return (
    <div {...rest} className={cx(styles.stepper, className)}>
      <p className={styles.position}>
        {format(strings.position, { current, total: steps.length })}
        {/* On narrow screens only the markers show, so the current step is named here. */}
        <span className={styles.currentLabel} aria-hidden>
          {steps[current - 1]?.label}
        </span>
      </p>
      <ol className={styles.list}>
        {steps.map((step, index) => {
          const number = index + 1
          const state = number < current ? 'done' : number === current ? 'current' : 'pending'
          return (
            <li
              key={step.id}
              data-state={state}
              aria-current={state === 'current' ? 'step' : undefined}
              className={styles.step}
            >
              <span className={styles.marker} aria-hidden>
                {state === 'done' ? <Icon icon={Check} size="sm" /> : number}
              </span>
              <span className={styles.label}>{step.label}</span>
              <span className="visually-hidden">{strings[state]}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
