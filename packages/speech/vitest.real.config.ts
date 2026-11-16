import { defineConfig } from 'vitest/config'

// Optional and outside CI: downloads the pinned whisper.cpp and its model and listens to a real audio
// (`pnpm test:real-speech`, T075 of 007). It costs no money nor AI quota.
export default defineConfig({
  define: { __YTC_ALLOW_FAKE_AI__: 'false' },
  test: { name: 'speech-real', environment: 'node', include: ['test/**/*.real.test.ts'], testTimeout: 1_800_000 },
})
