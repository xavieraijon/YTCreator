import { Icon, Logo } from '@ytcreator/ui'
import { Menu, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { docGroups, type DocGroup } from './docs/types.ts'
import styles from './Layout.module.css'
import { foundationCategories, href, useRoute, type Route } from './router.ts'
import { catalog } from './strings/catalog.es.ts'

export interface LayoutProps {
  /** Slot for the theme selector, always visible in the header. */
  readonly themeSwitcher?: ReactNode
  /** Component pages, filled from the documentation registry. */
  readonly components?: readonly { readonly id: string; readonly name: string; readonly group: DocGroup }[]
  readonly children: ReactNode
}

const isCurrent = (route: Route, target: Route) => JSON.stringify(route) === JSON.stringify(target)

export function Layout({ themeSwitcher, components = [], children }: LayoutProps) {
  const route = useRoute()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => setMenuOpen(false), [route])

  const link = (target: Exclude<Route, { page: 'not-found' }>, label: string) => (
    <li key={href(target)}>
      <a className={styles.link} href={href(target)} aria-current={isCurrent(route, target) ? 'page' : undefined}>
        {label}
      </a>
    </li>
  )

  return (
    <div className={styles.layout}>
      <a className={styles.skip} href="#main">
        {catalog.skipToContent}
      </a>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.menuButton}
          aria-expanded={menuOpen}
          aria-controls="catalog-nav"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <Icon icon={menuOpen ? X : Menu} label={menuOpen ? catalog.menu.close : catalog.menu.open} />
        </button>
        <a className={styles.brand} href={href({ page: 'home' })}>
          <Logo />
          <span className={styles.title}>{catalog.title}</span>
        </a>
        <div className={styles.actions}>{themeSwitcher}</div>
      </header>
      <nav id="catalog-nav" className={styles.nav} data-open={menuOpen} aria-label={catalog.nav.label}>
        <ul role="list" className={styles.list}>
          {link({ page: 'home' }, catalog.nav.home)}
        </ul>
        <h2 className={styles.heading}>{catalog.nav.foundations}</h2>
        <ul role="list" className={styles.list}>
          {foundationCategories.map((category) =>
            link({ page: 'foundation', category }, catalog.foundations[category]),
          )}
        </ul>
        {components.length > 0 && (
          <>
            <h2 className={styles.heading}>{catalog.nav.components}</h2>
            {docGroups.map((group) => {
              const members = components.filter((component) => component.group === group)
              if (members.length === 0) return null
              return (
                <div key={group} className={styles.group}>
                  <h3 className={styles.groupHeading}>{catalog.groups[group]}</h3>
                  <ul role="list" className={styles.list}>
                    {members.map(({ id, name }) => link({ page: 'component', id }, name))}
                  </ul>
                </div>
              )
            })}
          </>
        )}
        <ul role="list" className={styles.list}>
          {link({ page: 'sample' }, catalog.nav.sample)}
        </ul>
      </nav>
      <main id="main" className={styles.main} tabIndex={-1}>
        {children}
      </main>
    </div>
  )
}
