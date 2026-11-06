import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

// Outside 4310–4329 so the tests never collide with a real YTCreator running on this machine.
const port = 4399
const baseURL = `http://127.0.0.1:${port}`
const home = mkdtempSync(join(tmpdir(), 'ytcreator-e2e-'))

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // The SPA goes in web/ next to server.mjs, as in the release package (T154).
  webServer: {
    command:
      'pnpm build && pnpm --filter @ytcreator/server exec vite build --mode development && cp -R dist ../server/dist/web && node ../server/dist/server.mjs serve',
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      YTCREATOR_FAKE_AI: 'ok',
      YTCREATOR_FAKE_YOUTUBE: '1',
      YTCREATOR_PORT: String(port),
      HOME: home,
      XDG_DATA_HOME: join(home, '.local', 'share'),
    },
  },
})
