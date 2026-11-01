import { defineConfig } from 'vitest/config'

// Optional and outside CI: reaches the real YouTube through yt-dlp (`pnpm test:real-youtube`).
export default defineConfig({
  define: { __YTC_ALLOW_FAKE_AI__: 'false' },
  test: { name: 'youtube-real', environment: 'node', include: ['test/**/*.real.test.ts'], testTimeout: 120_000 },
})
