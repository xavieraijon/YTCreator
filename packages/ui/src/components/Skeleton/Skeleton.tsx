import type { ComponentProps } from 'react'
import { cx } from '../../utils/cx.ts'
import styles from './Skeleton.module.css'

export interface SkeletonProps extends Omit<ComponentProps<'span'>, 'children'> {
  readonly shape?: 'text' | 'rect' | 'circle'
  /** Only for `text`: number of lines; the last one is shorter. */
  readonly lines?: number
}

/** Placeholder while content loads. Hidden from screen readers: the container sets `aria-busy`. */
export function Skeleton({ shape = 'text', lines = 1, className, ...rest }: SkeletonProps) {
  const count = shape === 'text' ? Math.max(1, lines) : 1
  return (
    <span {...rest} aria-hidden data-shape={shape} className={cx(styles.skeleton, className)}>
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className={styles.block} />
      ))}
    </span>
  )
}
