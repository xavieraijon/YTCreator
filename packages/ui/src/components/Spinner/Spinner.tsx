import { LoaderCircle } from 'lucide-react'
import type { ComponentProps } from 'react'
import { Icon, type IconSize } from '../../icons/index.ts'
import { cx } from '../../utils/cx.ts'
import styles from './Spinner.module.css'

export interface SpinnerProps extends Omit<ComponentProps<'span'>, 'children'> {
  /** With it, the spinner is a `role="status"` with this text for screen readers. Without it, it is decorative. */
  readonly label?: string
  readonly size?: IconSize
}

/** Short wait. Only `transform` animates; with reduced motion it stays still (FR-014). */
export function Spinner({ label, size = 'md', className, ...rest }: SpinnerProps) {
  const a11y = label ? { role: 'status' } : { 'aria-hidden': true }
  return (
    <span {...rest} {...a11y} className={cx(styles.spinner, className)}>
      <Icon icon={LoaderCircle} size={size} className={styles.icon} />
      {label && <span className="visually-hidden">{label}</span>}
    </span>
  )
}
