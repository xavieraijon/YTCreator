import '@ytcreator/ui/styles.css'
import { ToastProvider, UiStringsProvider } from '@ytcreator/ui'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

// The theme is applied before the first paint by themeInit() (vite.config.ts) and follows the system.
createRoot(root).render(
  <StrictMode>
    <UiStringsProvider>
      {/* Below the header, so a toast never covers «Ajustes» (novice audit 003, round 2, M2). */}
      <ToastProvider offsetTop="var(--app-header-height, 0px)">
        <App />
      </ToastProvider>
    </UiStringsProvider>
  </StrictMode>,
)
