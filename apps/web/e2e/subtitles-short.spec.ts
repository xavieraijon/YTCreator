import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, type Page, test } from '@playwright/test'
import { auditor, tabTo } from './audit.ts'
import { api, profileByApi } from './channel-api.ts'
import { blockExternal, connectAccount, heading, startServer, toConnect, type TestServer } from './server.ts'

// The subtitles of a Short (US4, specs/007-subtitles/quickstart.md): a file longer than a Short is said before
// «Empezar», the track has the limits of a Short, and there are no chapters.
let server: TestServer

test.beforeAll(async () => {
  server = await startServer({ port: 4482, speech: { scenario: 'con-errores' } })
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

async function press(page: Page, name: string) {
  const button = page.getByRole('button', { name, exact: true })
  await page.locator('h1').first().click()
  await tabTo(page, button)
  await page.keyboard.press('Enter')
}

/** A WAV PCM 16 kHz mono of so many seconds of silence. */
function silentWav(seconds: number) {
  const rate = 16_000
  const data = seconds * rate * 2
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + data, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(data, 40)
  return Buffer.concat([header, Buffer.alloc(data)])
}

// An approved Short written with the fake AI through the API (005 is tested in its own e2e).
async function approvedShortByApi(channelId: string) {
  const { idea } = (await api(server, 'POST', `/api/channels/${channelId}/ideas`, {
    title: 'Pan en un minuto',
    format: 'short',
  })) as { idea: { id: string; revision: number } }
  await api(server, 'PATCH', `/api/ideas/${idea.id}`, { revision: idea.revision, status: 'elegida' })
  const scriptId = (await api(server, 'POST', `/api/ideas/${idea.id}/script`))['id'] as string
  const estimate = await api(server, 'POST', `/api/scripts/${scriptId}/estimate`, { use: 'guion_short' })
  await api(server, 'POST', `/api/scripts/${scriptId}/generate`, {
    use: 'guion_short',
    estimateId: estimate['estimateId'],
  })
  await expect
    .poll(async () => ((await api(server, 'GET', `/api/scripts/${scriptId}`))['job'] as { status: string }).status)
    .toBe('hecho')
  type Draft = { version: number; content: { claims: { status: string }[] } }
  const draft = (await api(server, 'GET', `/api/scripts/${scriptId}`))['draft'] as Draft
  await api(server, 'POST', `/api/scripts/${scriptId}/draft/approve`, {
    version: draft.version,
    acknowledgedPending: draft.content.claims.filter((claim) => claim.status === 'pendiente').length,
  })
  return scriptId
}

test('the subtitles of a Short: the warning before starting, one line, and no chapters (US4)', async ({
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
  const scriptId = await approvedShortByApi(channelId)

  await page.goto(`${server.baseURL}/canal/guiones/${scriptId}`)
  await page.getByRole('button', { name: 'Hacer los subtítulos' }).click()
  await expect(heading(page, 'Subtítulos')).toBeVisible()
  await press(page, 'Descargarlo')
  await expect(page.getByRole('button', { name: 'Elegir el vídeo o el audio' })).toBeVisible({ timeout: 30_000 })

  // A video without sound, and a file that is not a video: said in plain words before starting (spec, «Casos límite»).
  const file = page.locator('input[type="file"]')
  await file.setInputFiles(fixture('sin-sonido.mp4'))
  await expect(page.getByText('Este fichero no tiene sonido. Elige el vídeo montado o su audio.')).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByRole('button', { name: 'Empezar', exact: true })).toHaveCount(0)
  await audit(page)
  await file.setInputFiles({ name: 'notas.mp4', mimeType: 'video/mp4', buffer: Buffer.from('no es un vídeo') })
  await expect(page.getByText(/Este fichero no se puede leer aquí\./)).toBeVisible({ timeout: 30_000 })

  // A file longer than a Short: said before «Empezar», with the maximum and where it comes from; nothing is refused.
  await file.setInputFiles({ name: 'largo.wav', mimeType: 'audio/wav', buffer: silentWav(200) })
  await expect(page.getByText('Dura 3 min 20 s.')).toBeVisible({ timeout: 30_000 })
  await expect(
    page.getByText(/un Short puede durar hasta 3 min\. .*Puedes empezar igualmente o elegir otro fichero\./),
  ).toBeVisible()
  await expect(page.getByText(/Máximo de un Short, según el paquete de datos de YTCreator/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Empezar', exact: true })).toBeEnabled()
  await audit(page)

  // Another file, one that fits: the warning goes.
  const chooser = page.waitForEvent('filechooser')
  await press(page, 'Elegir otro fichero')
  await (await chooser).setFiles(fixture('pan.wav'))
  await expect(page.getByText('Dura 4 s.')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/un Short puede durar hasta/)).toHaveCount(0)
  await press(page, 'Empezar')

  // The track of a Short: one line per subtitle, and no chapters.
  await expect(page.getByRole('heading', { name: 'Tus subtítulos' })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('region', { name: 'Minutos reales de los capítulos' })).toHaveCount(0)
  const view = (await api(server, 'GET', `/api/scripts/${scriptId}/subtitles`)) as {
    format: string
    limits: { maxLines: { value: number } }
    latest: { content: { cues: { text: string }[] } }
  }
  expect(view.format).toBe('short')
  expect(view.limits.maxLines.value).toBe(1)
  for (const cue of view.latest.content.cues) expect(cue.text).not.toContain('\n')
  await audit(page)

  // Editing one says it is a single line; Escape leaves it as it was.
  const firstCue = page.getByRole('list', { name: 'Subtítulos' }).locator('button[class*="cueButton"]').first()
  await page.locator('h1').first().click()
  await tabTo(page, firstCue)
  await page.keyboard.press('Enter')
  await expect(page.getByText('En una sola línea.')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByText('En una sola línea.')).toHaveCount(0)

  // Approved and downloaded, as those of a long video: one line in every block of the SRT.
  await page.locator('h1').first().click()
  await tabTo(page, page.getByRole('button', { name: 'Aprobar los subtítulos' }))
  await page.keyboard.press('Enter')
  const approve = page.getByRole('dialog', { name: '¿Aprobar los subtítulos?' })
  await tabTo(page, approve.getByRole('button', { name: 'Aprobar', exact: true }))
  await page.keyboard.press('Enter')
  await expect(page.getByText(/Subtítulos aprobados el/)).toBeVisible()
  const downloaded = page.waitForEvent('download')
  await press(page, 'Descargar los subtítulos')
  const srt = readFileSync((await (await downloaded).path())!, 'utf8')
  const blocks = srt.trim().split(/\r?\n\r?\n/)
  expect(blocks.length).toBeGreaterThan(0)
  for (const block of blocks) expect(block.split(/\r?\n/)).toHaveLength(3)

  // Every subtitle of the channel, from the list of scripts, as data anyone can read (R17, FR-020).
  await page.goto(`${server.baseURL}/canal/guiones`)
  await expect(heading(page, 'Mis guiones')).toBeVisible()
  const all = page.waitForEvent('download')
  await press(page, 'Descargar todos los subtítulos como datos')
  const data = JSON.parse(readFileSync((await (await all).path())!, 'utf8')) as {
    subtitles: { scriptId: string; approvedVersion: number | null; srt: string }[]
  }
  expect(data.subtitles).toHaveLength(1)
  expect(data.subtitles[0]).toMatchObject({ scriptId })
  expect(data.subtitles[0]!.approvedVersion).not.toBeNull()
  expect(data.subtitles[0]!.srt).toContain('-->')
  await audit(page)
})
