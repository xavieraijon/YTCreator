import type { ComponentProps } from 'react'
import { cx } from '../../utils/cx.ts'
import styles from './Card.module.css'

export interface CardProps extends ComponentProps<'div'> {
  readonly as?: 'div' | 'section' | 'article' | 'li'
  /** The whole card reacts to hover, focus and press. Put a single link or button inside it. */
  readonly interactive?: boolean
}

/** Solid surface. Never glass: glass is for floating layers (FR-013). */
export function Card({ as = 'div', interactive, className, ...rest }: CardProps) {
  const Element = as as 'div'
  return <Element {...rest} data-interactive={interactive || undefined} className={cx(styles.card, className)} />
}
