import { useId, type ComponentProps, type CSSProperties } from 'react'
import { format } from '../../strings/format.ts'
import { useUiStrings } from '../../strings/UiStringsProvider.tsx'
import { cx } from '../../utils/cx.ts'
import styles from './ProgressBar.module.css'

export interface ProgressBarProps extends Omit<ComponentProps<'div'>, 'children'> {
  /** Always visible: says what is progressing. */
  readonly label: string
  /** From 0 to 100. Without it, the bar is indeterminate. */
  readonly value?: number
}

/** Progress of a long task. Shows the percentage as text, not only as length (FR-011). */
export function ProgressBar({ label, value, className, ...rest }: ProgressBarProps) {
  const strings = useUiStrings().progress
  const labelId = useId()
  const indeterminate = value === undefined
  const clamped = indeterminate ? 0 : Math.min(100, Math.max(0, Math.round(value)))
  return (
    <div {...rest} className={cx(styles.progress, className)}>
      <div className={styles.header}>
        <span id={labelId} className={styles.label}>
          {label}
        </span>
        {!indeterminate && (
          <span className={styles.value} aria-hidden>
            {format(strings.value, { value: clamped })}
          </span>
        )}
      </div>
      <div
        role="progressbar"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : clamped}
        data-indeterminate={indeterminate || undefined}
        className={styles.track}
        style={{ '--progress': `${clamped}%` } as CSSProperties}
      >
        <span className={styles.bar} />
      </div>
    </div>
  )
}
