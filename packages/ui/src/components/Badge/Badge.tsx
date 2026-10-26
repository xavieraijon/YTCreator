import type { ComponentProps } from 'react'
import { cx } from '../../utils/cx.ts'
import styles from './Badge.module.css'

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

export interface BadgeProps extends Omit<ComponentProps<'span'>, 'children'> {
  readonly tone?: BadgeTone
  /** One line. A long text is cut with an ellipsis and stays whole in `title` and for screen readers. */
  readonly children: string
}

/** Short state or category label. */
export function Badge({ tone = 'neutral', className, children, ...rest }: BadgeProps) {
  return (
    <span title={children} {...rest} data-tone={tone} className={cx(styles.badge, className)}>
      <span className={styles.text}>{children}</span>
    </span>
  )
}
