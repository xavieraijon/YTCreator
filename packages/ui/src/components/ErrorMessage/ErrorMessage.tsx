import { CircleAlert } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { Icon } from '../../icons/index.ts'
import { cx } from '../../utils/cx.ts'
import { Button } from '../Button/index.ts'
import styles from './ErrorMessage.module.css'

export interface ErrorMessageProps extends Omit<ComponentProps<'div'>, 'title'> {
  /** What happened, in plain words. */
  readonly title: string
  /** Why, and what the user can do. */
  readonly description?: ReactNode
  /** Required: an error always offers a way out (principle I). */
  readonly action: { readonly label: string; readonly onClick: () => void }
  /** Announces it as soon as it appears. Use it for errors that show up after an action. */
  readonly live?: boolean
}

/** An error that blocks a task. For a field error, use the field's `error` prop. */
export function ErrorMessage({ title, description, action, live = false, className, ...rest }: ErrorMessageProps) {
  return (
    <div {...rest} role={live ? 'alert' : undefined} className={cx(styles.errorMessage, className)}>
      <Icon icon={CircleAlert} size="md" className={styles.icon} />
      <div className={styles.text}>
        <p className={styles.title}>{title}</p>
        {description && <p className={styles.description}>{description}</p>}
        <Button onClick={action.onClick} className={styles.action}>
          {action.label}
        </Button>
      </div>
    </div>
  )
}
