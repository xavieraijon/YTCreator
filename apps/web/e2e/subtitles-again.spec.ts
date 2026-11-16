import { fileURLToPath } from 'node:url'
import { expect, type Page, test } from '@playwright/test'
import { auditor, tabTo } from './audit.ts'
import { api, approvedScriptByApi, profileByApi } from './channel-api.ts'
import { blockExternal, connectAccount, heading, startServer, toConnect, type TestServer } from './server.ts'

// Doing them again with another edit (US5, specs/007-subtitles/quickstart.md). The fake recognizer «hears» `hola`
// («Hola, bienvenidos al canal…») whatever the file says.
let server: TestServer

test.beforeAll(async () => {
  server = await startServer({ port: 4483, speech: { scenario: 'hola' } })
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

// Tabs from the title of the page to a control, as someone without a mouse would, and presses it.
async function press(page: Page, target: ReturnType<Page['locator']>) {
  await page.locator('h1').first().click()
  await tabTo(page, target)
  await page.keyboard.press('Enter')
}

type Latest = { version: number; content: { cues: { text: string }[] } }

// Approved subtitles from a first file, with «Hola» changed to «Buenas» in all of them, through the API (US1, US2).
async function approvedSubtitlesByApi(scriptId: string) {
  await api(server, 'POST', '/api/speech/engine', {})
  await expect
    .poll(async () => (await api(server, 'GET', '/api/speech/engine'))['installed'], { timeout: 30_000 })
    .toBe(true)
  const { readFileSync } = await import('node:fs')
  const uploaded = await fetch(`${server.baseURL}/api/scripts/${scriptId}/subtitles/audio?name=primero.wav`, {
    method: 'PUT',
    headers: { origin: server.baseURL, 'content-type': 'audio/wav' },
    body: readFileSync(fixture('pan.wav')),
  })
  expect(uploaded.ok).toBe(true)
  await api(server, 'POST', `/api/scripts/${scriptId}/subtitles/recognize`, {})
  const latest = async () => (await api(server, 'GET', `/api/scripts/${scriptId}/subtitles`))['latest'] as Latest | null
  await expect.poll(async () => (await latest())?.content.cues.length ?? 0, { timeout: 60_000 }).toBeGreaterThan(0)
  const replaced = (await api(server, 'POST', `/api/scripts/${scriptId}/subtitles/replace`, {
    baseVersion: (await latest())!.version,
    from: 'Hola',
    to: 'Buenas',
  })) as { latest: Latest }
  await api(server, 'POST', `/api/scripts/${scriptId}/subtitles/approve`, { version: replaced.latest.version })
}

test('another edit: a new version, the changes made again, the history and deleting the audio (US5)', async ({
  page,
  context,
}) => {
  test.setTimeout(240_000)
  await blockExternal(context)
  await page.goto(server.baseURL)
  await toConnect(page, 'Usar mi suscripción de Claude')
  await connectAccount(page)
  await expect(page.getByText('Cuenta 1 · Funciona')).toBeVisible()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(heading(page, 'Todo listo')).toBeVisible()
  await profileByApi(server)
  const channelId = ((await api(server, 'GET', '/api/channels/current'))['channel'] as { id: string }).id
  const scriptId = await approvedScriptByApi(server, channelId, 'Pan casero', 'Hola, bienvenidos al canal.')
  await approvedSubtitlesByApi(scriptId)

  await page.goto(`${server.baseURL}/canal/guiones/${scriptId}`)
  await page.getByRole('button', { name: 'Ver los subtítulos' }).click()
  await expect(page.getByRole('heading', { name: 'Tus subtítulos' })).toBeVisible()
  await expect(page.getByText(/Subtítulos aprobados el/)).toBeVisible()

  // «Otro montaje»: choosing another file says first that these are kept (AS1); going back leaves them as they were.
  await press(page, page.locator('summary', { hasText: 'Otro montaje' }))
  await press(page, page.getByRole('button', { name: 'Elegir otro fichero' }))
  await expect(
    page.getByText(/Se harán unos subtítulos nuevos con este fichero\. Los de ahora se guardan en el historial/),
  ).toBeVisible()
  await expect(page.getByText('Los nuevos estarán en borrador hasta que los apruebes.')).toBeVisible()
  await audit(page)
  await press(page, page.getByRole('button', { name: 'Volver a mis subtítulos' }))
  await expect(page.getByText(/Subtítulos aprobados el/)).toBeVisible()

  // The new file, heard as a new version.
  await press(page, page.locator('summary', { hasText: 'Otro montaje' }))
  await press(page, page.getByRole('button', { name: 'Elegir otro fichero' }))
  const chooser = page.waitForEvent('filechooser')
  await press(page, page.getByRole('button', { name: 'Elegir el vídeo o el audio' }))
  await (await chooser).setFiles(fixture('pan.mp4'))
  await expect(page.getByText('Dura 4 s.')).toBeVisible({ timeout: 30_000 })
  await press(page, page.getByRole('button', { name: 'Empezar', exact: true }))
  await expect(page.getByRole('heading', { name: 'Tus subtítulos' })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('Hechos con «pan.mp4»', { exact: false })).toBeVisible()
  await expect(page.getByText(/Subtítulos aprobados el/)).toHaveCount(0)

  // The changes made in all of them before, offered with how many subtitles change (AS2).
  const offer = page.getByRole('region', { name: 'Tus cambios en todos' })
  await expect(offer.getByText(/Si lo cambias también en estos, cambian 1 subtítulo\./)).toBeVisible()
  await expect(offer.getByText('«Hola» por «Buenas»')).toBeVisible()
  const list = page.getByRole('list', { name: 'Subtítulos' })
  await expect(list).toContainText('Hola')
  await audit(page)
  await press(page, offer.getByRole('button', { name: 'Cambiarlo también aquí' }))
  await expect(page.getByText('Hemos cambiado 1 subtítulo.')).toBeVisible()
  await expect(list).toContainText('Buenas')
  await expect(list).not.toContainText('Hola')

  // The whole history: the first file, its change, the new file and the changes made again.
  await press(page, page.locator('summary', { hasText: 'Historial' }))
  await expect(page.getByText(/Hecha al escuchar el audio/)).toHaveCount(2)
  await expect(page.getByText(/Con tus cambios en todos hechos otra vez/)).toBeVisible()

  // Deleting the audio: asked first; the subtitles stay and can no longer be heard here (R16).
  await expect(page.getByRole('button', { name: /^Oír el subtítulo/ }).first()).toBeVisible()
  await press(page, page.locator('summary', { hasText: 'Otro montaje' }))
  await press(page, page.getByRole('button', { name: 'Borrar el audio de este equipo' }))
  const confirm = page.getByRole('dialog', { name: '¿Borrar el audio de este equipo?' })
  await expect(confirm.getByText(/Tus subtítulos no cambian y tu vídeo no se toca\./)).toBeVisible()
  await audit(page)
  await tabTo(page, confirm.getByRole('button', { name: 'Borrar el audio' }))
  await page.keyboard.press('Enter')
  await expect(page.getByText('Hemos borrado el audio de este equipo.')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Oír el subtítulo/ })).toHaveCount(0)
  await expect(page.getByText(/para oírlos, elige el fichero otra vez en «Otro montaje»/)).toBeVisible()
  await expect(list).toContainText('Buenas')
  await audit(page)
})
