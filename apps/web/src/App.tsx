import type { OnboardingState } from '@ytcreator/core/api'
import { ErrorMessage } from '@ytcreator/ui'
import { useEffect, useRef, useState } from 'react'
import styles from './App.module.css'
import { kindLabel } from './ai/kindLabel.ts'
import { reloadAi } from './ai/useAiOverview.ts'
import { reloadOnboarding, useOnboarding, useOnboardingSync } from './onboarding/useOnboarding.ts'
import { navigate, onboardingRedirect, type Route, usePathname, useRoute } from './router.ts'
import { ConnectAi } from './screens/connect-later/ConnectAi.tsx'
import { Home } from './screens/home/Home.tsx'
import { ChooseAi } from './screens/onboarding/ChooseAi.tsx'
import { ConnectApiKey } from './screens/onboarding/ConnectApiKey.tsx'
import { ConnectSubscription } from './screens/onboarding/ConnectSubscription.tsx'
import { Done } from './screens/onboarding/Done.tsx'
import { Limits } from './screens/onboarding/Limits.tsx'
import { Welcome } from './screens/onboarding/Welcome.tsx'
import { AppHeader } from './shell/AppHeader.tsx'
import { errorText } from './shell/errorText.ts'
import { Link } from './shell/Link.tsx'
import { Screen } from './shell/Screen.tsx'
import { es } from './strings/es.ts'

// The routes that follow the server state wait for it; the rest of the app does not need it.
const needsState = (route: Route) =>
  route.page === 'root' || route.page === 'welcome' || route.page === 'wizard' || route.page === 'connectAi'

function Page({ route, state }: { route: Route; state: OnboardingState | null }) {
  const chosenKind = state?.chosenKind ?? null
  switch (route.page) {
    case 'root':
      return <Screen title={es.app.loading} />
    case 'welcome':
      return <Welcome />
    case 'wizard':
      switch (route.step) {
        case 'elegir':
          return <ChooseAi chosenKind={chosenKind} />
        case 'conectar':
          return chosenKind === 'pago_por_uso' ? (
            <ConnectApiKey chosenKind={chosenKind} />
          ) : (
            <ConnectSubscription chosenKind={chosenKind} />
          )
        case 'limites':
          return <Limits chosenKind={chosenKind} />
        case 'listo':
          return <Done chosenKind={chosenKind} />
      }
      break
    case 'connectAi':
      return <ConnectAi />
    case 'home':
      return <Home />
    case 'settings':
    case 'aiSettings':
    case 'generalSettings':
      return <Screen title={es.settings.title} />
    case 'switchAi':
      return <Screen title={kindLabel(route.kind)} />
    case 'notFound':
      return (
        <Screen title={es.app.notFoundTitle}>
          <Link to={{ page: 'home' }}>{es.app.notFoundBack}</Link>
        </Screen>
      )
  }
}

export function App() {
  const pathname = usePathname()
  const route = useRoute()
  const mainRef = useRef<HTMLElement>(null)
  const firstRender = useRef(true)
  const [closed, setClosed] = useState(false)
  const { state, error } = useOnboarding()
  useOnboardingSync()

  // Every step may change the connections (leaving conectar activates the subscription): the badge follows.
  const revision = state?.revision
  useEffect(() => {
    if (revision !== undefined) void reloadAi()
  }, [revision])

  const redirect = state ? onboardingRedirect(route, state) : null
  useEffect(() => {
    if (redirect) navigate(redirect, { replace: true })
  }, [redirect])

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
        {closed ? (
          <Screen title={es.header.closed} />
        ) : needsState(route) && !state && error ? (
          <Screen title={es.app.loadFailed}>
            <ErrorMessage
              live
              title={errorText(error)}
              action={{ label: es.app.retry, onClick: () => void reloadOnboarding() }}
            />
          </Screen>
        ) : (needsState(route) && !state) || redirect ? (
          <Screen title={es.app.loading} />
        ) : (
          <Page route={route} state={state} />
        )}
      </main>
    </div>
  )
}
