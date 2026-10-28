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
      <ToastProvider>
        <App />
      </ToastProvider>
    </UiStringsProvider>
  </StrictMode>,
)
