import type { LucideIcon } from 'lucide-react'
import styles from './Icon.module.css'

export type IconSize = 'sm' | 'md' | 'lg'

export interface IconProps {
  /** Any icon from `lucide-react`. */
  readonly icon: LucideIcon
  readonly size?: IconSize
  /** Only for icons that carry meaning on their own. Without it the icon is decorative and hidden from assistive tech. */
  readonly label?: string
  readonly className?: string
}

/** Single icon style for the whole product: lucide outline, stroke 1.75, three sizes (FR-016). */
export function Icon({ icon: Glyph, size = 'md', label, className }: IconProps) {
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true }
  return (
    <Glyph
      {...a11y}
      strokeWidth={1.75}
      focusable={false}
      className={[styles.icon, styles[size], className].filter(Boolean).join(' ')}
    />
  )
}
