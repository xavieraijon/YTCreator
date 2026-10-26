import type { ComponentProps, MouseEvent } from 'react'
import { useUiStrings } from '../../strings/UiStringsProvider.tsx'
import { cx } from '../../utils/cx.ts'
import { Spinner } from '../Spinner/index.ts'
import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ComponentProps<'button'> {
  readonly variant?: ButtonVariant
  readonly size?: ButtonSize
  /**
   * Shows a spinner and blocks the click, but keeps the focus and the accessible name: a `disabled` button would
   * drop the focus in the middle of the action.
   */
  readonly loading?: boolean
}

/** Starts an action. One `primary` per view. */
export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  type = 'button',
  className,
  onClick,
  children,
  ...rest
}: ButtonProps) {
  const strings = useUiStrings().button
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (loading) {
      event.preventDefault()
      return
    }
    onClick?.(event)
  }
  return (
    <button
      {...rest}
      type={type}
      data-variant={variant}
      data-size={size}
      data-loading={loading || undefined}
      aria-busy={loading || undefined}
      aria-disabled={loading || rest['aria-disabled'] || undefined}
      onClick={handleClick}
      className={cx(styles.button, className)}
    >
      <span className={styles.content}>{children}</span>
      {loading && (
        <span className={styles.spinner}>
          <Spinner size={size === 'lg' ? 'md' : 'sm'} />
          <span className="visually-hidden">{strings.loading}</span>
        </span>
      )}
    </button>
  )
}
