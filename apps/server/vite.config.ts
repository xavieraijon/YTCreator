import { defineConfig } from 'vite'

// Bundles the whole server (migrations and prompts included) into a single dist/server.mjs (R24).
export default defineConfig(({ mode }) => ({
  define: {
    // Removes the fake AI provider from the published build.
    __YTC_ALLOW_FAKE_AI__: JSON.stringify(mode !== 'production'),
  },
  ssr: { noExternal: true, target: 'node' },
  build: {
    ssr: 'src/cli.ts',
    outDir: 'dist',
    target: 'node24',
    sourcemap: mode !== 'production',
    rollupOptions: { output: { entryFileNames: 'server.mjs' } },
  },
}))
