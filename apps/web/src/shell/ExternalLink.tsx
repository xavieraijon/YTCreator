import { Icon } from '@ytcreator/ui'
import { ExternalLink as ExternalLinkIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { es } from '../strings/es.ts'
import styles from './ExternalLink.module.css'

// A page outside YTCreator: always another tab, without access back to this one. The arrow and the hidden text say
// so before it happens (contracts/ui-screens.md, Jerarquía de acciones).
export function ExternalLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <a
      className={[styles.link, className].filter(Boolean).join(' ')}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
      <Icon icon={ExternalLinkIcon} size="sm" className={styles.icon} />
      <span className="visually-hidden"> {es.app.newTab}</span>
    </a>
  )
}
