import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, type BrowserContext, type Page } from '@playwright/test'

// A YTCreator of its own for a spec (built by the shared webServer): the wizard keeps its state on disk, so the
// specs that move it must not share an instance. Ports outside 4310–4329, and other than 4398 and 4399.
const serverMjs = fileURLToPath(new URL('../../server/dist/server.mjs', import.meta.url))

export interface TestServer {
  readonly baseURL: string
  readonly home: string
  stop(): Promise<void>
  /** Stops it and starts it again on the same HOME (and, if given, with another fake AI). */
  restart(scenario?: string): Promise<void>
}

export async function startServer({ port, scenario = 'ok' }: { port: number; scenario?: string }): Promise<TestServer> {
  const baseURL = `http://127.0.0.1:${port}`
  const home = mkdtempSync(join(tmpdir(), 'ytcreator-e2e-'))
  let child: ChildProcess | null = null

  const healthResponds = async () => {
    try {
      return (await fetch(`${baseURL}/api/health`, { signal: AbortSignal.timeout(500) })).ok
    } catch {
      return false
    }
  }

  const start = async (fakeAi: string) => {
    child = spawn(process.execPath, [serverMjs, 'serve'], {
      env: {
        ...process.env,
        YTCREATOR_FAKE_AI: fakeAi,
        YTCREATOR_FAKE_YOUTUBE: '1',
        YTCREATOR_PORT: String(port),
        HOME: home,
        XDG_DATA_HOME: join(home, '.local', 'share'),
      },
      stdio: 'ignore',
    })
    await expect.poll(healthResponds, { timeout: 15_000 }).toBe(true)
  }

  const stop = async () => {
    const running = child
    child = null
    if (!running || running.exitCode !== null) return
    const exited = new Promise((resolve) => running.once('exit', resolve))
    running.kill()
    await exited
  }

  await start(scenario)
  return {
    baseURL,
    home,
    stop,
    async restart(next = scenario) {
      await stop()
      await start(next)
    },
  }
}

// No test leaves the machine: Claude's login page (the fake's example.invalid) and the external links answer empty.
export async function blockExternal(context: BrowserContext): Promise<void> {
  await context.route(/^https:\/\/(example\.invalid|claude\.ai|console\.anthropic\.com)\//, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>externa</title>' }),
  )
}

export const heading = (page: Page, name: string | RegExp) => page.getByRole('heading', { level: 1, name })

type Option = 'Usar mi suscripción de Claude' | 'Pagar solo lo que uses'

// The radio sits under its card's label, which takes the click.
// The choice screen ignores clicks in its first moments (the second click of a double click on «Empezar»).
// Paying per use is behind «Más opciones» (decision 1 of 002).
export async function choose(page: Page, option: Option) {
  if (option === 'Pagar solo lo que uses') {
    // Already shown if it was the option chosen before; otherwise, once the screen is there.
    const more = page.getByRole('button', { name: 'Más opciones' })
    await expect(more.or(page.getByRole('radio', { name: option }))).toBeVisible()
    if (await more.isVisible()) await more.click()
  }
  await expect(async () => {
    await page.getByText(option, { exact: true }).click()
    await expect(page.getByRole('radio', { name: option })).toBeChecked({ timeout: 300 })
  }).toPass()
}

// From the welcome to the connect step with the given option.
export async function toConnect(page: Page, option: Option) {
  await page.getByRole('button', { name: 'Empezar' }).click()
  await expect(heading(page, 'Elige cómo usar la IA')).toBeVisible()
  await choose(page, option)
  await page.getByRole('button', { name: 'Continuar' }).click()
}

export const FAKE_CODE = 'ABCD-1234'
export const FAKE_KEY = 'sk-ant-api03-FAKE-e2e-0123456789abcdef'

// Claude's page opens on the click as about:blank and gets its address once the server answers. Closing it in the
// middle of that navigation can leave close() hanging on Linux Chromium, so it closes once the page has loaded.
export async function closeClaudePage(popup: Promise<Page>) {
  const tab = await popup
  await tab.waitForURL((url) => url.href !== 'about:blank')
  await tab.waitForLoadState()
  await tab.close()
}

// Opens Claude's page (a popup the test closes), pastes the code and connects.
export async function connectAccount(page: Page, code = FAKE_CODE) {
  const popup = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Abrir la página de Claude' }).click()
  await closeClaudePage(popup)
  await page.getByLabel('Código de Claude').fill(code)
  await page.getByRole('button', { name: 'Conectar', exact: true }).click()
}
