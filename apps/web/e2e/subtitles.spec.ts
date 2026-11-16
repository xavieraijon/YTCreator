import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, type Page, test } from '@playwright/test'
import { auditor, tabTo } from './audit.ts'
import { api, approvedScriptByApi, profileByApi } from './channel-api.ts'
import { blockExternal, connectAccount, heading, startServer, toConnect, type TestServer } from './server.ts'

// The subtitles, story by story (specs/007-subtitles/quickstart.md). The fake recognizer «hears» `con-errores`
// whatever the audio says, slowly enough to reload in the middle; the program comes from a fake server.
let server: TestServer

test.beforeAll(async () => {
  server = await startServer({ port: 4480, speech: { scenario: 'con-errores', stepMs: 1_500 } })
})

test.afterAll(async () => {
  await server.stop()
})

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/subtitles/${name}`, import.meta.url))

const audit = async (page: Page) => {
  const { failures, audit: check } = auditor(page, { onlyWcag: false })
  await check(await page.locator('h1').first().innerText())
  expect(failures).toEqual([])
}

// Once per server: the tests of this file share it, and the second one finds the AI already connected.
let connected = false
async function connect(page: Page) {
  await page.goto(server.baseURL)
  if (connected) return
  await toConnect(page, 'Usar mi suscripción de Claude')
  await connectAccount(page)
  await expect(page.getByText('Cuenta 1 · Funciona')).toBeVisible()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(heading(page, 'Todo listo')).toBeVisible()
  await profileByApi(server)
  connected = true
}

// The keyboard reaches a button with Tab, its focus shows, and Enter presses it.
async function press(page: Page, name: string) {
  const button = page.getByRole('button', { name, exact: true })
  await page.locator('h1').first().click()
  await tabTo(page, button)
  await page.keyboard.press('Enter')
}

test('subtitles from the video, coming back while it listens, and the SRT (US1)', async ({ page, context }) => {
  test.setTimeout(240_000)
  await blockExternal(context)
  await connect(page)
  const channelId = ((await api(server, 'GET', '/api/channels/current'))['channel'] as { id: string }).id
  const scriptId = await approvedScriptByApi(
    server,
    channelId,
    'Pan con masa madre',
    'Hoy hacemos pan con masa madre y harina de fuerza, a 250 grados.',
  )

  // From the approved script.
  await page.goto(`${server.baseURL}/canal/guiones/${scriptId}`)
  await page.getByRole('button', { name: 'Hacer los subtítulos' }).click()
  await expect(heading(page, 'Subtítulos')).toBeVisible()

  // The program that listens, once, saying how much it takes.
  await expect(page.getByRole('heading', { name: 'El programa que escucha el audio' })).toBeVisible()
  await expect(page.getByText(/Para escuchar el audio hace falta descargar una vez un programa de unos/)).toBeVisible()
  // What it needs and that it stays here, before downloading anything (AS1).
  await expect(page.getByText('Hace falta el vídeo ya montado o solo su audio.')).toBeVisible()
  await expect(page.getByText('Lo escucha tu propio equipo')).toBeVisible()
  await audit(page)
  await press(page, 'Descargarlo')
  await expect(page.getByRole('button', { name: 'Elegir el vídeo o el audio' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Lo escucha tu propio equipo')).toBeVisible()

  // The video: its sound is taken out here, then its length and how long it will take.
  await page.locator('input[type="file"]').setInputFiles(fixture('pan.mp4'))
  await expect(page.getByText('Fichero: pan.mp4')).toBeVisible()
  await expect(page.getByText('Dura 4 s.')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('status').filter({ hasText: /Tardará/ })).toBeVisible()
  await audit(page)
  await press(page, 'Empezar')

  // Listening: leaving and coming back finds it where it was.
  await expect(page.getByRole('status').filter({ hasText: 'Escuchando el audio' })).toBeVisible()
  await page.reload()
  await expect(heading(page, 'Subtítulos')).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Escuchando el audio' })).toBeVisible()
  await expect(page.getByRole('progressbar', { name: /Escuchando: \d+ %|Preparando el audio/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Parar' })).toBeVisible()
  await audit(page)

  // Reviewing: what was heard wrong of a word in the script is written as in the script, and says so.
  await expect(page.getByRole('heading', { name: 'Tus subtítulos' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Hechos con «pan.mp4»')).toBeVisible()
  await expect(page.getByRole('radio', { name: /Para revisar \(\d+\)/ })).toBeChecked()
  const list = page.getByRole('list', { name: 'Subtítulos' })
  await expect(list.getByText(/Escrito como en tu guion; se oyó «.*masa madr y arina/)).toBeVisible()
  await expect(list).toContainText('madre')
  await audit(page)

  // The SRT that goes to YouTube Studio.
  const downloaded = page.waitForEvent('download')
  await press(page, 'Descargar los subtítulos')
  const file = await downloaded
  expect(file.suggestedFilename()).toMatch(/^subtitulos-[a-z0-9-]+\.srt$/)
  const srt = readFileSync((await file.path())!, 'utf8')
  const blocks = srt.trim().split(/\r?\n\r?\n/)
  expect(blocks.length).toBeGreaterThan(0)
  blocks.forEach((block, i) => {
    const [number, time, ...lines] = block.split(/\r?\n/)
    expect(number).toBe(String(i + 1))
    expect(time).toMatch(/^\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}$/)
    expect(lines.length).toBeGreaterThan(0)
  })
  expect(srt).toContain('madre')

  // Back in the script, its state.
  await page.getByRole('button', { name: 'Volver al guion' }).click()
  await expect(page.getByText('Subtítulos: borrador')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ver los subtítulos' })).toBeVisible()
})

interface SeenCue {
  id: string
  text: string
}

// Subtitles made through the API (US1 is proved above): the program, the audio and the recognition.
async function subtitlesByApi(scriptId: string): Promise<SeenCue[]> {
  await api(server, 'POST', '/api/speech/engine', {})
  await expect
    .poll(async () => (await api(server, 'GET', '/api/speech/engine'))['installed'], { timeout: 30_000 })
    .toBe(true)
  const uploaded = await fetch(`${server.baseURL}/api/scripts/${scriptId}/subtitles/audio?name=pan.wav`, {
    method: 'PUT',
    headers: { origin: server.baseURL, 'content-type': 'audio/wav' },
    body: readFileSync(fixture('pan.wav')),
  })
  expect(uploaded.ok).toBe(true)
  await api(server, 'POST', `/api/scripts/${scriptId}/subtitles/recognize`, {})
  const cues = async () =>
    (
      (await api(server, 'GET', `/api/scripts/${scriptId}/subtitles`))['latest'] as {
        content: { cues: SeenCue[] }
      } | null
    )?.content.cues ?? []
  await expect.poll(async () => (await cues()).length, { timeout: 60_000 }).toBeGreaterThan(0)
  return cues()
}

// The cue buttons of the list, in order: each one is the subtitle itself.
const cueButtons = (page: Page) => page.getByRole('list', { name: 'Subtítulos' }).locator('button[class*="cueButton"]')

// Tabs from the title of the page to a control, as someone without a mouse would.
async function reach(page: Page, target: ReturnType<Page['locator']>) {
  await page.locator('h1').first().click()
  await tabTo(page, target)
}

async function open(page: Page, summary: string) {
  const toggle = page.locator('summary', { hasText: summary })
  await reach(page, toggle)
  await page.keyboard.press('Enter')
}

test('reviewing with the keyboard: listen, edit, split, join, change in all, the AI, the history and approving (US2)', async ({
  page,
  context,
}) => {
  test.setTimeout(240_000)
  await blockExternal(context)
  await connect(page)
  const channelId = ((await api(server, 'GET', '/api/channels/current'))['channel'] as { id: string }).id
  const scriptId = await approvedScriptByApi(
    server,
    channelId,
    'Pan de pueblo',
    'Hoy hacemos pan con masa madre y harina de fuerza, a 250 grados.',
  )
  const first = await subtitlesByApi(scriptId)
  await page.goto(`${server.baseURL}/canal/subtitulos/${scriptId}`)
  await expect(page.getByRole('heading', { name: 'Tus subtítulos' })).toBeVisible()

  // All of them.
  const all = page.getByRole('radio', { name: /^Todos/ })
  await reach(page, page.getByRole('radio', { name: /Para revisar/ }))
  await page.keyboard.press('ArrowDown')
  await expect(all).toBeChecked()
  const cues = cueButtons(page)
  await expect(cues).toHaveCount(first.length)
  await audit(page)

  // Space listens to that piece of the audio only.
  const heard = page.waitForRequest((request) => request.url().includes('/subtitles/audio'))
  await reach(page, cues.first())
  await page.keyboard.press('Space')
  await heard
  await expect(page.getByRole('heading', { name: /Editar el subtítulo/ })).toHaveCount(0)

  // Enter edits it: a new text, saved; the focus goes back to it.
  await page.keyboard.press('Enter')
  const area = page.getByRole('textbox', { name: 'Texto' })
  await expect(area).toBeFocused()
  await audit(page)
  // Escape closes without saving.
  await page.keyboard.press('Escape')
  await expect(area).toHaveCount(0)
  await expect(cues.first()).toBeFocused()
  await page.keyboard.press('Enter')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('Hoy hacemos pan casero')
  await tabTo(page, page.getByRole('button', { name: 'Guardar', exact: true }))
  await page.keyboard.press('Enter')
  await expect(cues.first()).toContainText('Hoy hacemos pan casero')
  await expect(cues.first()).toBeFocused()

  // Split where the cursor is, then join them again.
  await page.keyboard.press('Enter')
  await expect(area).toBeFocused()
  await page.keyboard.press('ControlOrMeta+Home')
  for (let i = 0; i < 'Hoy hacemos'.length; i++) await page.keyboard.press('ArrowRight')
  await tabTo(page, page.getByRole('button', { name: 'Partir aquí' }))
  await page.keyboard.press('Enter')
  await expect(cues).toHaveCount(first.length + 1)
  await expect(cues.first()).toContainText('Hoy hacemos')
  await expect(cues.first()).not.toContainText('casero')
  await expect(cues.first()).toBeFocused()
  await page.keyboard.press('Enter')
  await tabTo(page, page.getByRole('button', { name: 'Juntar con el siguiente' }))
  await page.keyboard.press('Enter')
  await expect(cues).toHaveCount(first.length)
  await expect(cues.first()).toContainText('Hoy hacemos pan casero')

  // «Cambiar en todos»: how many first.
  await open(page, 'Cambiar en todos')
  await tabTo(page, page.getByRole('textbox', { name: 'Cambiar' }))
  await page.keyboard.type('casero')
  await page.keyboard.press('Tab')
  await page.keyboard.type('de pueblo')
  await tabTo(page, page.getByRole('button', { name: 'Cambiar en todos', exact: true }))
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: '¿Cambiar «casero» por «de pueblo»?' })
  await expect(dialog.getByText('Se cambiará 1 subtítulo.')).toBeVisible()
  await audit(page)
  await tabTo(page, dialog.getByRole('button', { name: 'Cambiar', exact: true }))
  await page.keyboard.press('Enter')
  await expect(page.getByText('Cambiado en 1 subtítulo.')).toBeVisible()
  await expect(cues.first()).toContainText('Hoy hacemos pan de pueblo')

  // The AI's review: the cost on the button, then each change to accept.
  await open(page, 'Revisar con la IA')
  await tabTo(page, page.getByRole('button', { name: /^Revisar con la IA/ }))
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: /La IA propone \d+ cambios?/ })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/Por qué: /).first()).toBeVisible()
  await audit(page)
  // Nothing is accepted until it is marked: one yes, the others no.
  const choices = page.getByRole('checkbox', { name: /Aceptar el cambio del subtítulo de/ })
  await expect(choices.first()).not.toBeChecked()
  await tabTo(page, choices.first())
  await page.keyboard.press('Space')
  await expect(choices.first()).toBeChecked()
  await tabTo(page, page.getByRole('button', { name: 'Guardar 1 cambio aceptado' }))
  await page.keyboard.press('Enter')
  await expect(page.getByText(/Cambio de la IA/)).toHaveCount(1)

  // The history: back to the first version, as a new one.
  await open(page, 'Historial')
  const back = page.getByRole('button', { name: 'Volver a esta: la versión 1' })
  await tabTo(page, back)
  await audit(page)
  await page.keyboard.press('Enter')
  await expect(cues.first()).toHaveText(new RegExp(first[0]!.text.split('\n')[0]!.slice(0, 10)))
  await expect(page.getByText('Recuperada de la versión 1')).toBeVisible()

  // Approving, with what is left to review said first; it stays after reloading.
  await reach(page, page.getByRole('button', { name: 'Aprobar los subtítulos' }))
  await page.keyboard.press('Enter')
  // Version 1 still has subtitles to review: it says how many before approving.
  const approve = page.getByRole('dialog', { name: '¿Aprobar los subtítulos?' })
  await expect(
    approve.getByText(/por revisar: no los? has dado por revisados?\. Puedes aprobarlos igualmente\./),
  ).toBeVisible()
  await tabTo(page, approve.getByRole('button', { name: 'Aprobar', exact: true }))
  await page.keyboard.press('Enter')
  await expect(page.getByText(/Subtítulos aprobados el/)).toBeVisible()
  await page.reload()
  await expect(page.getByText(/Subtítulos aprobados el/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Aprobar los subtítulos' })).toHaveCount(0)
  // Opening one says that a change takes them back to draft (FR-013); Escape leaves them as they were.
  await reach(page, cueButtons(page).first())
  await page.keyboard.press('Enter')
  await expect(page.getByText(/si guardas un cambio, volverán a borrador/)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByText(/Subtítulos aprobados el/)).toBeVisible()
  await open(page, 'Historial')
  await expect(page.getByText(/si vuelves a otra versión, volverán a borrador/)).toBeVisible()
  await audit(page)
})
