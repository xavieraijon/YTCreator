import { expect, type Page, test } from '@playwright/test'
import { auditor, tabTo } from './audit.ts'
import { api, profileByApi } from './channel-api.ts'
import { blockExternal, connectAccount, heading, startServer, toConnect, type TestServer } from './server.ts'

// The real minutes of the chapters (US3, specs/007-subtitles/quickstart.md). The fake recognizer «hears» the five
// blocks of the script below, the third one 40 s later than the script says.
let server: TestServer

test.beforeAll(async () => {
  server = await startServer({ port: 4481, speech: { scenario: 'capitulos' } })
})

test.afterAll(async () => {
  await server.stop()
})

// What the fake recognizer says in «capitulos»: the script is written with the same sentences.
const SENTENCES = [
  'Hoy te enseño el error que comete casi todo el mundo cuando hace pan en casa y por qué la miga le sale tan densa, tan pesada y tan triste cada vez.',
  'Pasa porque la harina del supermercado tiene muy poca fuerza y el agua fría frena a la levadura durante las primeras horas de reposo encima de la encimera.',
  'Lo primero que hay que cambiar es la temperatura del agua: tibia y nunca caliente, con una cucharada de miel para despertar a la masa madre que lleva días dormida.',
  'El paso que marca la diferencia es plegar la masa cuatro veces, una cada media hora y sin amasar, para que la red de gluten se forme sola y muy despacio.',
  'Mañana prueba con medio kilo de harina de fuerza, hornéalo a doscientos cincuenta grados con un poco de vapor y cuéntame en los comentarios cómo te ha quedado.',
]

const audit = async (page: Page) => {
  const { failures, audit: check } = auditor(page, { onlyWcag: false })
  await check(await page.locator('h1').first().innerText())
  expect(failures).toEqual([])
}

async function reach(page: Page, target: ReturnType<Page['locator']>) {
  await page.locator('h1').first().click()
  await tabTo(page, target)
}

type Body = Record<string, unknown>
type Pieces = Record<string, { version: number; content: Body }>

// An approved script whose blocks say the sentences above, written with the fake AI through the API (005).
async function scriptByApi(channelId: string) {
  const { idea } = (await api(server, 'POST', `/api/channels/${channelId}/ideas`, {
    title: 'Pan con miga',
    format: 'largo',
  })) as { idea: { id: string; revision: number } }
  await api(server, 'PATCH', `/api/ideas/${idea.id}`, { revision: idea.revision, status: 'elegida' })
  const scriptId = (await api(server, 'POST', `/api/ideas/${idea.id}/script`))['id'] as string
  const ask = async (use: string) => {
    const estimate = await api(server, 'POST', `/api/scripts/${scriptId}/estimate`, { use })
    await api(server, 'POST', `/api/scripts/${scriptId}/generate`, { use, estimateId: estimate['estimateId'] })
    await expect
      .poll(async () => ((await api(server, 'GET', `/api/scripts/${scriptId}`))['job'] as { status: string }).status)
      .toBe('hecho')
    return api(server, 'GET', `/api/scripts/${scriptId}`)
  }
  const outline = (await ask('escaleta'))['outline'] as { version: number }
  await api(server, 'POST', `/api/scripts/${scriptId}/outline/approve`, { version: outline.version })
  type Draft = { version: number; content: { blocks: { text: string }[]; claims: { status: string }[] } }
  let draft = (await ask('guion'))['draft'] as Draft
  expect(draft.content.blocks).toHaveLength(SENTENCES.length)
  const blocks = draft.content.blocks.map((block, index) => ({ ...block, text: SENTENCES[index]! }))
  draft = (
    await api(server, 'PUT', `/api/scripts/${scriptId}/draft`, {
      baseVersion: draft.version,
      content: { ...draft.content, blocks },
    })
  )['draft'] as Draft
  await api(server, 'POST', `/api/scripts/${scriptId}/draft/approve`, {
    version: draft.version,
    acknowledgedPending: draft.content.claims.filter((claim) => claim.status === 'pendiente').length,
  })
  return scriptId
}

// Its package with both steps approved, through the API (006 is tested in publish.spec.ts).
async function approvedPackage(scriptId: string) {
  const id = (await api(server, 'POST', `/api/scripts/${scriptId}/package`))['id'] as string
  const ask = async (use: string) => {
    const estimate = await api(server, 'POST', `/api/packages/${id}/estimate`, { use })
    await api(server, 'POST', `/api/packages/${id}/generate`, { use, estimateId: estimate['estimateId'] })
    await expect
      .poll(async () => ((await api(server, 'GET', `/api/packages/${id}`))['job'] as { status: string }).status)
      .toBe('hecho')
    return (await api(server, 'GET', `/api/packages/${id}`))['pieces'] as Pieces
  }
  const titles = (await ask('titulos'))['titulos']!
  const main = (titles.content['candidates'] as { id: string }[])[0]!.id
  await api(server, 'PUT', `/api/packages/${id}/pieces/titulos`, {
    baseVersion: titles.version,
    content: { ...titles.content, main },
  })
  const thumbnails = (await ask('miniaturas'))['miniaturas']!
  const chosen = (thumbnails.content['concepts'] as { id: string }[])[0]!.id
  await api(server, 'PUT', `/api/packages/${id}/pieces/miniaturas`, {
    baseVersion: thumbnails.version,
    content: { ...thumbnails.content, chosen: [chosen] },
  })
  await api(server, 'POST', `/api/packages/${id}/approve`, {
    step: 'portada',
    versions: { titulos: titles.version + 1, miniaturas: thumbnails.version + 1 },
  })
  const texts = await ask('descripcion')
  const approved = await api(server, 'POST', `/api/packages/${id}/approve`, {
    step: 'textos',
    versions: Object.fromEntries(
      ['descripcion', 'capitulos', 'etiquetas', 'comentario'].map((kind) => [kind, texts[kind]!.version]),
    ),
  })
  expect(approved['status']).toBe('textos_aprobados')
  return id
}

/** A WAV PCM 16 kHz mono of so many seconds of silence: what the browser would have taken out of the video. */
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

// Its subtitles, made through the API (US1 is tested in subtitles.spec.ts).
async function subtitlesByApi(scriptId: string) {
  await api(server, 'POST', '/api/speech/engine', {})
  await expect
    .poll(async () => (await api(server, 'GET', '/api/speech/engine'))['installed'], { timeout: 30_000 })
    .toBe(true)
  const uploaded = await fetch(`${server.baseURL}/api/scripts/${scriptId}/subtitles/audio?name=pan-con-miga.wav`, {
    method: 'PUT',
    headers: { origin: server.baseURL, 'content-type': 'audio/wav' },
    body: silentWav(100),
  })
  expect(uploaded.ok).toBe(true)
  await api(server, 'POST', `/api/scripts/${scriptId}/subtitles/recognize`, {})
  await expect
    .poll(async () => (await api(server, 'GET', `/api/scripts/${scriptId}/subtitles`))['latest'], { timeout: 60_000 })
    .not.toBeNull()
}

test('the real minutes of the chapters: see them, accept part of them and approve the package again (US3)', async ({
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
  const scriptId = await scriptByApi(channelId)
  const packageId = await approvedPackage(scriptId)

  // Before the subtitles, the package says how to get the real minutes.
  await page.goto(`${server.baseURL}/canal/publicaciones/${packageId}`)
  await page.getByRole('button', { name: 'Descripción', exact: true }).click()
  await expect(page.getByText('Cuando tengas el vídeo montado, haz los subtítulos', { exact: false })).toBeVisible()

  // With them, it leads there.
  await subtitlesByApi(scriptId)
  await page.reload()
  await page.getByRole('button', { name: 'Descripción', exact: true }).click()
  await page.getByRole('button', { name: 'Poner los minutos reales' }).click()
  await expect(heading(page, 'Subtítulos')).toBeVisible()

  // Each chapter with its minute now, the real one and the difference (AS1); those that change are marked.
  const section = page.getByRole('region', { name: 'Minutos reales de los capítulos' })
  await expect(section.getByText(/^En el audio: /).first()).toBeVisible()
  await expect(section.getByText('El primero siempre empieza en 0:00.')).toBeVisible()
  const marks = section.getByRole('checkbox')
  await expect(marks).toHaveCount(3)
  for (const mark of await marks.all()) await expect(mark).toBeChecked()
  await expect(section.getByText(/\d+ s más tarde/)).toHaveCount(3)
  await audit(page)

  // Only the third one: the others are left with the keyboard.
  const third = marks.nth(0)
  await reach(page, marks.nth(1))
  await page.keyboard.press('Space')
  await expect(marks.nth(1)).not.toBeChecked()
  await tabTo(page, marks.nth(2))
  await page.keyboard.press('Space')
  await expect(marks.nth(2)).not.toBeChecked()
  await expect(third).toBeChecked()
  await expect(third).toHaveAccessibleName('Poner el minuto real de «El truco»')

  // The package was approved: it says so before (AS4).
  await tabTo(page, section.getByRole('button', { name: 'Poner estos minutos' }))
  await page.keyboard.press('Enter')
  const confirm = page.getByRole('dialog', { name: '¿Poner estos minutos?' })
  await expect(confirm.getByText('Tu publicación volverá a borrador y tendrás que aprobarla otra vez.')).toBeVisible()
  await audit(page)
  await tabTo(page, confirm.getByRole('button', { name: 'Poner los minutos' }))
  await page.keyboard.press('Enter')
  await expect(section.getByText('Hemos cambiado 1 capítulo de tu publicación.')).toBeVisible()
  // Asked again, the third one is in its real minute; the estimated ones after it moved with it (R3 of 006), so they
  // are a second or two from theirs at most.
  await expect(section.getByText(/Ahora: .* \(minuto real\)/)).toHaveCount(1)
  await expect(section.getByText(/^En el audio: .* · ([12] s (más tarde|antes)|Igual)$/)).toHaveCount(4)

  // The package, back in draft, with the real minute; approved again.
  await section.getByRole('button', { name: 'Ver la publicación' }).click()
  await page.getByRole('button', { name: 'Descripción', exact: true }).click()
  await expect(page.getByText(/se queda el minuto real, el del audio/)).toHaveCount(1)
  await audit(page)
  await page.getByRole('button', { name: 'Aprobar descripción' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Descripción aprobada.', { exact: false })).toBeVisible()
})
