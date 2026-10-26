import '@ytcreator/ui/styles.css'
import { ThemeSwitcher, ToastProvider, UiStringsProvider } from '@ytcreator/ui'
import { type ComponentType, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ComponentPage } from './docs/ComponentPage.tsx'
import { registry } from './docs/registry.ts'
import { BordersPage } from './foundations/BordersPage.tsx'
import { BreakpointsPage } from './foundations/BreakpointsPage.tsx'
import { ColorPage } from './foundations/ColorPage.tsx'
import { ElevationPage } from './foundations/ElevationPage.tsx'
import { GlassPage } from './foundations/GlassPage.tsx'
import { IconsPage } from './foundations/IconsPage.tsx'
import { LayersPage } from './foundations/LayersPage.tsx'
import { MotionPage } from './foundations/MotionPage.tsx'
import { RadiusPage } from './foundations/RadiusPage.tsx'
import { SpacingPage } from './foundations/SpacingPage.tsx'
import { TypographyPage } from './foundations/TypographyPage.tsx'
import { Home } from './Home.tsx'
import { ChooseApproach } from './sample/ChooseApproach.tsx'
import { Layout } from './Layout.tsx'
import { type FoundationCategory, useRoute } from './router.ts'
import { catalog } from './strings/catalog.es.ts'

const foundationPages: Record<FoundationCategory, ComponentType> = {
  color: ColorPage,
  tipografia: TypographyPage,
  espaciado: SpacingPage,
  radios: RadiusPage,
  elevacion: ElevationPage,
  cristal: GlassPage,
  bordes: BordersPage,
  capas: LayersPage,
  movimiento: MotionPage,
  'puntos-de-ruptura': BreakpointsPage,
  iconos: IconsPage,
}

function NotFound() {
  return (
    <>
      <h1>{catalog.notFound.title}</h1>
      <a href="#/">{catalog.notFound.back}</a>
    </>
  )
}

function Page() {
  const route = useRoute()
  switch (route.page) {
    case 'home':
      return <Home />
    case 'foundation': {
      const Foundation = foundationPages[route.category]
      return <Foundation />
    }
    case 'component': {
      const doc = registry.find((entry) => entry.id === route.id)
      return doc ? <ComponentPage key={doc.id} doc={doc} /> : <NotFound />
    }
    case 'sample':
      return <ChooseApproach />
    case 'not-found':
      return <NotFound />
  }
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <UiStringsProvider>
      <ToastProvider>
        <Layout themeSwitcher={<ThemeSwitcher />} components={registry}>
          <Page />
        </Layout>
      </ToastProvider>
    </UiStringsProvider>
  </StrictMode>,
)
