import { defineConfig } from 'vitest/config'

// Optional and outside CI: the real AI, only with the creator's authorization (`pnpm test:real-ai`, T087 of 005,
// T068 of 006). The fake AI stays allowed because the package test sets up its channel with it, as every test does;
// the real provider is still forced in each test with `createRegistry({ allowFake: false })`.
export default defineConfig({
  define: { __YTC_ALLOW_FAKE_AI__: 'true' },
  test: { name: 'server-real', environment: 'node', include: ['test/**/*.real.test.ts'], testTimeout: 900_000 },
})
