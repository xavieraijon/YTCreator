import type { AnchorHTMLAttributes, MouseEvent } from 'react'
import { href, navigate, type Target } from '../router.ts'

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  readonly to: Target
}

// A real <a> (works with middle click and "open in new tab") that navigates in place on a plain click.
export function Link({ to, onClick, children, ...rest }: LinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate(to)
  }
  return (
    <a {...rest} href={href(to)} onClick={handleClick}>
      {children}
    </a>
  )
}
