import { defineConfig } from 'vitest/config'

// Tests may use the fake AI provider; the published build sets it to false (apps/server/vite.config.ts).
const allowFakeAi = { __YTC_ALLOW_FAKE_AI__: 'true' }

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'tokens', root: 'packages/tokens', environment: 'node', include: ['test/**/*.test.ts'] } },
      { test: { name: 'ui', root: 'packages/ui', environment: 'node', include: ['test/**/*.test.ts'] } },
      { test: { name: 'core', root: 'packages/core', environment: 'node', include: ['test/**/*.test.ts'] } },
      {
        define: allowFakeAi,
        test: { name: 'ai', root: 'packages/ai', environment: 'node', include: ['test/**/*.test.ts'] },
      },
      { test: { name: 'catalog', root: 'apps/catalog', environment: 'node', include: ['test/**/*.test.ts'] } },
      {
        define: allowFakeAi,
        test: { name: 'server', root: 'apps/server', environment: 'node', include: ['test/**/*.test.ts'] },
      },
      { test: { name: 'web', root: 'apps/web', environment: 'node', include: ['test/**/*.test.ts'] } },
      {
        test: {
          name: 'installer',
          root: 'installer',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          testTimeout: 120_000,
        },
      },
    ],
  },
})
