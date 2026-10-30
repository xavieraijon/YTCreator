import react from '@vitejs/plugin-react'
import { themeInit } from '@ytcreator/ui/vite'
import { defineConfig } from 'vite'

// In development the API runs on its own process (pnpm --filter @ytcreator/server dev), on the first port of R4.
const devServer = 'http://127.0.0.1:4310'

export default defineConfig({
  plugins: [react(), themeInit()],
  // Every asset as a file: the server's CSP (default-src 'self') blocks `data:` URLs, the logo's mask among them.
  build: { assetsInlineLimit: 0 },
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    proxy: { '/api': { target: devServer, changeOrigin: true } },
  },
})
