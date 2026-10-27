import type { ComponentProps } from 'react'
import { cx } from '../../utils/cx.ts'
import { ProgressBar } from '../ProgressBar/index.ts'
import styles from './AiWorking.module.css'

export interface AiWorkingProps extends Omit<ComponentProps<'div'>, 'children'> {
  /** Always visible: says what the AI is doing, such as «Escribiendo tu guion…». */
  readonly label: string
  /** From 0 to 100 when the task knows how far it is. */
  readonly progress?: number
  /** `inline` sits next to the content; `panel` fills the area where the result will appear. */
  readonly variant?: 'inline' | 'panel'
}

/**
 * The signature of the AI at work: an aurora with `gradient-ai` around a visible text (FR-011).
 * Only transform and opacity animate; with reduced motion the gradient stays still.
 */
export function AiWorking({ label, progress, variant = 'inline', className, ...rest }: AiWorkingProps) {
  return (
    <div {...rest} role="status" data-variant={variant} className={cx(styles.aiWorking, className)}>
      <div className={styles.content}>
        {progress === undefined ? (
          <p className={styles.label}>{label}</p>
        ) : (
          <ProgressBar label={label} value={progress} />
        )}
      </div>
    </div>
  )
}
