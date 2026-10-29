import type { ReactNode } from 'react'

// A page outside YTCreator: always another tab, without access back to this one.
export function ExternalLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}
