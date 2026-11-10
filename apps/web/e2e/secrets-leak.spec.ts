import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { blockExternal, connectAccount, heading, startServer, toConnect, type TestServer } from './server.ts'

// SC-006 (contracts/secrets.md): the credentials go in through the screens and never come out anywhere else. Only
// their 4-character hint may show. Outside 4310–4329, other than the ports the other specs use.
const PORT = 4388

// New on each run, so finding them in a versioned file can only mean a leak, not this spec's own source.
const run = randomBytes(12).toString('hex')
const GOOD_KEY = `sk-ant-api03-FAKE-leak-${run}`
const BAD_KEY = `sk-ant-api03-FAKE-bad-${run}`
// What the fake login hands over for the first account (packages/ai/src/fake/fake-login.ts).
const TOKEN = `sk-ant-oat-FAKE-1-${'x'.repeat(40)}`
// The YouTube key of Ajustes → YouTube (FR-033). The fake check refuses the one that says «bad».
const GOOD_YT = `AIzaFAKE-good-${run}`
const BAD_YT = `AIzaFAKE-bad-${run}`

// Each one whole and without its last 4 characters, the hint.
const needles = [GOOD_KEY, BAD_KEY, TOKEN, GOOD_YT, BAD_YT].flatMap((secret) => [secret, secret.slice(0, -4)])

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))

let server: TestServer

test.beforeEach(async () => {
  server = await startServer({ port: PORT })
})

test.afterEach(async () => {
  await server.stop()
})

interface Seen {
  where: string
  text: string
}

function leaksIn(seen: Seen[]): string[] {
  return seen.flatMap(({ where, text }) =>
    needles.filter((needle) => text.includes(needle)).map((needle) => `${where}: ${needle}`),
  )
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return filesUnder(path)
    return entry.isFile() ? [path] : []
  })
}

// Everything in git: a needle found there can only be a leak, since each run makes new ones.
const gitFiles = () =>
  execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .map((file) => join(repoRoot, file))

// Byte by byte, so the database and anything else binary count too.
function leaksInFiles(paths: string[], label: (path: string) => string): string[] {
  const bytes = needles.map((needle) => Buffer.from(needle))
  return paths.flatMap((path) => {
    if (!statSync(path, { throwIfNoEntry: false })?.isFile()) return []
    const content = readFileSync(path)
    return bytes.filter((needle) => content.includes(needle)).map((needle) => `${label(path)}: ${needle}`)
  })
}

test('no credential leaks to the logs, the disk, the HTTP answers, the DOM, localStorage or git (SC-006)', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000)
  await blockExternal(context)

  const seen: Seen[] = []
  const bodies: Promise<void>[] = []
  page.on('response', (response) => {
    bodies.push(
      response.text().then(
        (text) => void seen.push({ where: `HTTP ${response.request().method()} ${response.url()}`, text }),
        () => undefined, // redirects and aborted requests have no body
      ),
    )
  })

  // The DOM (with the values the inputs hold, which are not attributes) and localStorage, at the end of a screen.
  // `typing`: after a failed check «Tu clave» keeps what the creator wrote, so the retry can send it again; only
  // that field, and only while on that screen, is left out (contracts/secrets.md).
  const screen = async (name: string, { typing = false } = {}) => {
    const state = await page.evaluate((typing) => {
      const typed = typing
        ? [...document.querySelectorAll('label')].find((label) => label.textContent?.trim() === 'Tu clave')?.control
        : null
      typed?.setAttribute('data-typed', '')
      const copy = document.documentElement.cloneNode(true) as HTMLElement
      typed?.removeAttribute('data-typed')
      copy.querySelector('[data-typed]')?.removeAttribute('value')
      return {
        html: copy.outerHTML,
        inputs: [...document.querySelectorAll('input, textarea')]
          .filter((field) => field !== typed)
          .map((field) => (field as HTMLInputElement).value),
        storage: Object.entries(localStorage),
      }
    }, typing)
    seen.push({ where: `DOM «${name}»`, text: state.html })
    seen.push({ where: `inputs «${name}»`, text: state.inputs.join('\n') })
    seen.push({ where: `localStorage «${name}»`, text: JSON.stringify(state.storage) })
  }

  const accountRows = page
    .getByRole('region', { name: 'Cuentas de suscripción' })
    .getByRole('list')
    .first()
    .getByRole('listitem')
  const others = page.getByRole('region', { name: 'Otras opciones' })

  await page.goto(server.baseURL)

  // The subscription, through the wizard.
  await toConnect(page, 'Usar mi suscripción de Claude')
  await connectAccount(page)
  await expect(page.getByText('Cuenta 1 · Funciona')).toBeVisible()
  await screen('conectar suscripción')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(heading(page, 'Todo listo')).toBeVisible()
  await screen('listo')
  await page.getByRole('button', { name: 'Ir al inicio' }).click()
  await expect(heading(page, 'Inicio')).toBeVisible()
  await screen('inicio')

  // Checked again from the AI settings.
  await page.getByRole('link', { name: 'Tu suscripción de Claude · Funciona' }).click()
  await expect(heading(page, 'Ajustes')).toBeVisible()
  await accountRows.nth(0).getByRole('button', { name: 'Comprobar', exact: true }).click()
  await expect(accountRows.nth(0)).toContainText('Funciona')
  await screen('ajustes con la suscripción')

  // A key Anthropic refuses.
  await server.restart('sin_sesion:clave_no_valida')
  await page.reload()
  await others.getByText('Más opciones', { exact: true }).click()
  await others.getByRole('button', { name: 'Configurar' }).click()
  await expect(heading(page, 'Conecta tu clave de Anthropic')).toBeVisible()
  await page.getByLabel('Tu clave').fill(BAD_KEY)
  await page.getByRole('button', { name: 'Comprobar y guardar' }).click()
  await expect(page.getByText('La clave no es válida.')).toBeVisible()
  await screen('clave rechazada', { typing: true })

  // A key that works, made the option in use with its limits, and checked.
  await server.restart('ok')
  await page.reload()
  await expect(heading(page, 'Conecta tu clave de Anthropic')).toBeVisible()
  await page.getByLabel('Tu clave').fill(GOOD_KEY)
  await page.getByRole('button', { name: 'Comprobar y guardar' }).click()
  await expect(page.getByText(`Clave guardada ••••${GOOD_KEY.slice(-4)} · Funciona`)).toBeVisible()
  await screen('clave guardada')
  await page.getByRole('button', { name: 'Usar esta opción' }).click()
  await expect(heading(page, 'Límites de gasto')).toBeVisible()
  await page.getByRole('button', { name: 'Guardar límites' }).click()
  await expect(heading(page, 'Ajustes')).toBeVisible()
  await page.getByRole('button', { name: 'Comprobar ahora' }).click()
  await expect(page.getByRole('link', { name: 'Pago por uso de Anthropic · Funciona' })).toBeVisible()
  await screen('ajustes con la clave')

  // Back to the subscription, then everything removed.
  await others.getByRole('button', { name: 'Usar esta opción' }).click()
  await expect(page.getByRole('link', { name: 'Tu suscripción de Claude · Funciona' })).toBeVisible()
  await screen('vuelta a la suscripción')

  await page.getByRole('region', { name: 'Claves guardadas' }).getByRole('button', { name: 'Borrar' }).click()
  const removeKey = page.getByRole('dialog', { name: '¿Borrar esta clave?' })
  await removeKey.getByRole('button', { name: 'Borrar' }).click()
  await expect(page.getByRole('region', { name: 'Claves guardadas' })).toHaveCount(0)
  await screen('clave borrada')

  await accountRows.nth(0).getByRole('button', { name: 'Borrar' }).click()
  const removeAccount = page.getByRole('dialog', { name: '¿Borrar Cuenta 1?' })
  await removeAccount.getByRole('button', { name: 'Borrar' }).click()
  await expect(page.getByRole('link', { name: 'Sin IA conectada' })).toBeVisible()
  await screen('cuenta borrada')

  // Stopped, so the logs and the database are all on disk.
  await server.stop()
  await Promise.all(bodies)

  // The whole HOME: APP_HOME (logs, database, secrets/ already emptied) and ~/YTCreator.
  const found = [
    ...leaksIn(seen),
    ...leaksInFiles(filesUnder(server.home), (path) => path.slice(server.home.length)),
    ...leaksInFiles(gitFiles(), (path) => `git ${path.slice(repoRoot.length)}`),
  ]
  expect(found).toEqual([])
  // The hint is all that may show, and it did.
  expect(seen.some(({ text }) => text.includes(`••••${GOOD_KEY.slice(-4)}`))).toBe(true)
})

test('the YouTube key leaks nowhere either: only its hint shows (FR-033, T124)', async ({ page, context }) => {
  test.setTimeout(60_000)
  await blockExternal(context)

  const seen: Seen[] = []
  const bodies: Promise<void>[] = []
  page.on('response', (response) => {
    bodies.push(
      response.text().then(
        (text) => void seen.push({ where: `HTTP ${response.request().method()} ${response.url()}`, text }),
        () => undefined,
      ),
    )
  })
  // The DOM and localStorage after each step. `typing`: a refused key stays in its field so it can be corrected.
  const screen = async (name: string, { typing = false } = {}) => {
    const state = await page.evaluate((typing) => {
      const typed = typing
        ? [...document.querySelectorAll('label')].find((label) => label.textContent?.trim() === 'Tu clave de YouTube')
            ?.control
        : null
      typed?.setAttribute('data-typed', '')
      const copy = document.documentElement.cloneNode(true) as HTMLElement
      typed?.removeAttribute('data-typed')
      copy.querySelector('[data-typed]')?.removeAttribute('value')
      return {
        html: copy.outerHTML,
        inputs: [...document.querySelectorAll('input, textarea')]
          .filter((field) => field !== typed)
          .map((field) => (field as HTMLInputElement).value),
        storage: Object.entries(localStorage),
      }
    }, typing)
    seen.push({ where: `DOM «${name}»`, text: state.html })
    seen.push({ where: `inputs «${name}»`, text: state.inputs.join('\n') })
    seen.push({ where: `localStorage «${name}»`, text: JSON.stringify(state.storage) })
  }

  await page.goto(`${server.baseURL}/ajustes/youtube`)
  await expect(heading(page, 'Ajustes')).toBeVisible()
  await page.locator('summary', { hasText: 'Modo experto' }).click()

  await page.getByLabel('Tu clave de YouTube').fill(BAD_YT)
  await page.getByRole('button', { name: 'Comprobar y guardar' }).click()
  await expect(page.getByText('YouTube no acepta esta clave.')).toBeVisible()
  await screen('clave de YouTube rechazada', { typing: true })

  await page.getByLabel('Tu clave de YouTube').fill(GOOD_YT)
  await page.getByRole('button', { name: 'Comprobar y guardar' }).click()
  await expect(page.getByText(`Clave guardada ••••${GOOD_YT.slice(-4)}`)).toBeVisible()
  await screen('clave de YouTube guardada')

  await page.reload()
  await page.locator('summary', { hasText: 'Modo experto' }).click()
  await expect(page.getByText(`Clave guardada ••••${GOOD_YT.slice(-4)}`)).toBeVisible()
  await screen('ajustes de YouTube al volver')

  await page.getByRole('button', { name: 'Borrar la clave' }).click()
  await page
    .getByRole('dialog', { name: '¿Borrar la clave de YouTube?' })
    .getByRole('button', { name: 'Borrar' })
    .click()
  await expect(page.getByText(`Clave guardada ••••${GOOD_YT.slice(-4)}`)).toHaveCount(0)
  await screen('clave de YouTube borrada')

  await server.stop()
  await Promise.all(bodies)

  const found = [
    ...leaksIn(seen),
    ...leaksInFiles(filesUnder(server.home), (path) => path.slice(server.home.length)),
    ...leaksInFiles(gitFiles(), (path) => `git ${path.slice(repoRoot.length)}`),
  ]
  expect(found).toEqual([])
  expect(seen.some(({ text }) => text.includes(`••••${GOOD_YT.slice(-4)}`))).toBe(true)
})
