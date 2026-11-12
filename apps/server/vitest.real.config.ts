import { defineConfig } from 'vitest/config'

// Optional and outside CI: the real AI, only with the creator's authorization (`pnpm test:real-ai`, T087).
export default defineConfig({
  define: { __YTC_ALLOW_FAKE_AI__: 'false' },
  test: { name: 'server-real', environment: 'node', include: ['test/**/*.real.test.ts'], testTimeout: 900_000 },
})
