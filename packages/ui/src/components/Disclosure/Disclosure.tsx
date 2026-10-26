import { ChevronRight } from 'lucide-react'
import { useState, type ComponentProps, type ReactNode } from 'react'
import { Icon } from '../../icons/index.ts'
import { cx } from '../../utils/cx.ts'
import styles from './Disclosure.module.css'

export interface DisclosureProps extends Omit<ComponentProps<'details'>, 'title' | 'open' | 'onToggle'> {
  /** Text of the summary. Plain text: it is the whole accessible name. */
  readonly summary: string
  readonly open?: boolean
  readonly defaultOpen?: boolean
  readonly onOpenChange?: (open: boolean) => void
  readonly children: ReactNode
}

/** Shows and hides optional content. Native `<details>`: closed content is never focusable. */
export function Disclosure({
  summary,
  open,
  defaultOpen = false,
  onOpenChange,
  className,
  children,
  ...rest
}: DisclosureProps) {
  const [initial] = useState(defaultOpen)
  return (
    <details
      {...rest}
      open={open ?? initial}
      onToggle={(event) => onOpenChange?.(event.currentTarget.open)}
      className={cx(styles.disclosure, className)}
    >
      <summary className={styles.summary}>
        <Icon icon={ChevronRight} size="sm" className={styles.chevron} />
        {summary}
      </summary>
      <div className={styles.content}>{children}</div>
    </details>
  )
}
