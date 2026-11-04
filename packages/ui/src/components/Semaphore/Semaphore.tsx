import { CircleCheck, CircleHelp, CircleX, type LucideIcon, TriangleAlert } from 'lucide-react'
import type { ComponentProps } from 'react'
import { Icon } from '../../icons/index.ts'
import { useUiStrings } from '../../strings/UiStringsProvider.tsx'
import { cx } from '../../utils/cx.ts'
import styles from './Semaphore.module.css'

export type SemaphoreState = 'verde' | 'ambar' | 'rojo' | 'sin_comprobar'

export interface SemaphoreProps extends Omit<ComponentProps<'span'>, 'children'> {
  readonly state: SemaphoreState
  /** What the state means here («Libre», «Ocupado»). By default, the general word for the state. */
  readonly children?: string
}

const ICONS: Record<SemaphoreState, LucideIcon> = {
  verde: CircleCheck,
  ambar: TriangleAlert,
  rojo: CircleX,
  sin_comprobar: CircleHelp,
}

/** A traffic light with a shape and a text for each state, never only a color. */
export function Semaphore({ state, children, className, ...rest }: SemaphoreProps) {
  const strings = useUiStrings().semaphore
  return (
    <span {...rest} data-state={state} className={cx(styles.semaphore, className)}>
      <Icon icon={ICONS[state]} size="sm" />
      <span>{children ?? strings[state]}</span>
    </span>
  )
}
