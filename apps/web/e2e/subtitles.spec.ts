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

async function connect(page: Page) {
  await page.goto(server.baseURL)
  await toConnect(page, 'Usar mi suscripción de Claude')
  await connectAccount(page)
  await expect(page.getByText('Cuenta 1 · Funciona')).toBeVisible()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(heading(page, 'Todo listo')).toBeVisible()
  await profileByApi(server)
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
