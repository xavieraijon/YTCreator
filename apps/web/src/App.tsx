import { useEffect, useRef, useState } from 'react'
import styles from './App.module.css'
import { type Route, usePathname, useRoute } from './router.ts'
import { AppHeader } from './shell/AppHeader.tsx'
import { Link } from './shell/Link.tsx'
import { Screen } from './shell/Screen.tsx'
import { es } from './strings/es.ts'

// Empty screens until each user story fills them in.
function Page({ route }: { route: Route }) {
  switch (route.page) {
    case 'root':
      return <Screen title={es.app.loading} />
    case 'welcome':
      return <Screen title={es.welcome.title} />
    case 'wizard':
      switch (route.step) {
        case 'elegir':
          return <Screen title={es.choose.title} />
        case 'conectar':
          return <Screen title={es.wizard.steps.conectar} />
        case 'limites':
          return <Screen title={es.limits.title} />
        case 'listo':
          return <Screen title={es.done.title} />
      }
      break
    case 'connectAi':
      return <Screen title={es.connectAi.title} />
    case 'home':
      return <Screen title={es.home.title} />
    case 'settings':
    case 'aiSettings':
    case 'generalSettings':
      return <Screen title={es.settings.title} />
    case 'switchAi':
      return <Screen title={es.ai.provider[providerOf[route.kind]]} />
    case 'notFound':
      return (
        <Screen title={es.app.notFoundTitle}>
          <Link to={{ page: 'home' }}>{es.app.notFoundBack}</Link>
        </Screen>
      )
  }
}

const providerOf = { suscripcion: 'claude_code', pago_por_uso: 'anthropic' } as const

export function App() {
  const pathname = usePathname()
  const route = useRoute()
  const mainRef = useRef<HTMLElement>(null)
  const firstRender = useRef(true)
  const [closed, setClosed] = useState(false)

  // On every screen change (not on the first load) the focus goes to the new h1 (contracts/ui-screens.md).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const main = mainRef.current
    const title = main?.querySelector<HTMLElement>('h1')
    ;(title ?? main)?.focus()
  }, [pathname, closed])

  const inWizard = route.page === 'welcome' || route.page === 'wizard'

  return (
    <div className={styles.app}>
      <a className={styles.skip} href="#main">
        {es.app.skipToContent}
      </a>
      <AppHeader inWizard={inWizard} closed={closed} onClosed={() => setClosed(true)} />
      <main id="main" ref={mainRef} className={styles.main} tabIndex={-1}>
        {closed ? <Screen title={es.header.closed} /> : <Page route={route} />}
      </main>
    </div>
  )
}
