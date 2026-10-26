import type { LucideIcon } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { Icon } from '../../icons/index.ts'
import { cx } from '../../utils/cx.ts'
import { Button } from '../Button/index.ts'
import styles from './EmptyState.module.css'

export interface EmptyStateProps extends Omit<ComponentProps<'div'>, 'title'> {
  readonly icon: LucideIcon
  readonly title: string
  /** Keeps the page outline right: use the level that follows the section heading. */
  readonly titleAs?: 'h2' | 'h3' | 'h4'
  readonly description?: ReactNode
  /** The next step, such as «Añadir la primera idea». */
  readonly action?: { readonly label: string; readonly onClick: () => void }
}

/** Says why a place is empty and what to do next. Never a bare «No hay datos». */
export function EmptyState({
  icon,
  title,
  titleAs: Title = 'h3',
  description,
  action,
  className,
  ...rest
}: EmptyStateProps) {
  return (
    <div {...rest} className={cx(styles.emptyState, className)}>
      <span className={styles.iconWrap}>
        <Icon icon={icon} size="lg" />
      </span>
      <Title className={styles.title}>{title}</Title>
      {description && <p className={styles.description}>{description}</p>}
      {action && (
        <Button variant="primary" onClick={action.onClick} className={styles.action}>
          {action.label}
        </Button>
      )}
    </div>
  )
}
