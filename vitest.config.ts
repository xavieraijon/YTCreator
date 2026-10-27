import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'tokens', root: 'packages/tokens', environment: 'node', include: ['test/**/*.test.ts'] } },
      { test: { name: 'ui', root: 'packages/ui', environment: 'node', include: ['test/**/*.test.ts'] } },
      { test: { name: 'catalog', root: 'apps/catalog', environment: 'node', include: ['test/**/*.test.ts'] } },
    ],
  },
})
