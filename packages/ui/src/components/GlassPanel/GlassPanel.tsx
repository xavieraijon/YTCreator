import type { ComponentProps } from 'react'
import { cx } from '../../utils/cx.ts'
import styles from './GlassPanel.module.css'

export interface GlassPanelProps extends ComponentProps<'div'> {
  readonly as?: 'div' | 'section' | 'aside' | 'header' | 'nav'
  /** Shadow level: 2 for panels next to the content, 3 for layers that float over it. */
  readonly elevation?: 2 | 3
}

/**
 * Translucent floating layer. Never for long reading such as scripts or descriptions (FR-013).
 * With reduced transparency, or without backdrop-filter support, it turns into a solid raised surface.
 */
export function GlassPanel({ as = 'div', elevation = 2, className, ...rest }: GlassPanelProps) {
  const Element = as as 'div'
  return <Element {...rest} data-elevation={elevation} className={cx(styles.panel, className)} />
}
