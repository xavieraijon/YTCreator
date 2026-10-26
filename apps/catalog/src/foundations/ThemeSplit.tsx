import type { ReactNode } from 'react'
import { foundations } from '../strings/foundations.es.ts'
import styles from './ThemeSplit.module.css'

export interface ThemeSplitProps {
  readonly children: ReactNode
  /** `compact` puts two small cells side by side, without labels, for a table row. */
  readonly size?: 'full' | 'compact'
}

/**
 * Paints the same content twice, forcing `color-scheme: light` on one side and `dark` on the other. Semantic tokens
 * resolve with `light-dark()`, so each side shows its own theme whatever the page theme is (contracts/catalog.md).
 */
export function ThemeSplit({ children, size = 'full' }: ThemeSplitProps) {
  return (
    <div className={styles.split} data-size={size}>
      {(['light', 'dark'] as const).map((scheme) => (
        <div key={scheme} className={styles.side} data-scheme={scheme}>
          {size === 'full' ? (
            <span className={styles.label}>{foundations.themes[scheme]}</span>
          ) : (
            <span className="visually-hidden">{foundations.themes[scheme]}</span>
          )}
          {children}
        </div>
      ))}
    </div>
  )
}
