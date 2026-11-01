// Replaced at build time by apps/server/vite.config.ts: false in the published build.
declare const __YTC_ALLOW_FAKE_AI__: boolean

// Read only when `__YTC_ALLOW_FAKE_AI__` is true: tests and e2e swap the real YouTube for the fake one.
declare namespace NodeJS {
  interface ProcessEnv {
    YTCREATOR_FAKE_YOUTUBE?: '1'
  }
}
