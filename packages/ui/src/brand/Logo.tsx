import styles from './Logo.module.css'

export interface LogoProps {
  /** Hides the product name and leaves only the mark. The accessible name stays. */
  readonly markOnly?: boolean
  readonly className?: string
}

const productName = 'YTCreator'

/**
 * Provisional logo (FR-023). The mark is `logo.svg` used as a mask over the brand gradient,
 * so replacing that file changes the logo without touching any component.
 */
export function Logo({ markOnly = false, className }: LogoProps) {
  return (
    <span role="img" aria-label={productName} className={[styles.logo, className].filter(Boolean).join(' ')}>
      <span className={styles.mark} aria-hidden="true" />
      {!markOnly && (
        <span className={styles.wordmark} aria-hidden="true">
          {productName}
        </span>
      )}
    </span>
  )
}
