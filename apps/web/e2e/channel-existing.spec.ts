import { expect, type Page, test } from '@playwright/test'
import { auditor } from './audit.ts'
import { blockExternal, connectAccount, heading, startServer, toConnect, type TestServer } from './server.ts'

let server: TestServer

test.beforeAll(async () => {
  server = await startServer({ port: 4384 })
})

test.afterAll(async () => {
  await server.stop()
})

// Every screen of the journey in both themes, at 1280 and 375 px and at 200 % zoom (T123).
const audit = async (page: Page) => {
  const { failures, audit: check } = auditor(page, { onlyWcag: false })
  await check(await page.locator('h1').first().innerText())
  expect(failures).toEqual([])
}

test('an existing channel from its link to the profile, with the fakes (US4)', async ({ page, context }) => {
  test.setTimeout(300_000)
  await blockExternal(context)
  await page.goto(server.baseURL)
  await toConnect(page, 'Usar mi suscripción de Claude')
  await connectAccount(page)
  await expect(page.getByText('Cuenta 1 · Funciona')).toBeVisible()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(heading(page, 'Todo listo')).toBeVisible()
  await page.getByRole('button', { name: 'Ir al inicio' }).click()
  await page.getByRole('button', { name: 'Crear mi primer canal' }).click()
  await page.getByRole('button', { name: 'Ya tengo un canal' }).click()

  // The link: says what it needs, and what to paste when it does not find it.
  await expect(heading(page, 'Busca tu canal')).toBeVisible()
  const field = page.getByLabel('El enlace de tu canal o su @')
  await audit(page)
  await page.getByRole('button', { name: 'Buscar mi canal' }).click()
  await expect(page.getByText('Pega el enlace de tu canal')).toBeVisible()
  await field.fill('@nadietieneesto')
  await page.getByRole('button', { name: 'Buscar mi canal' }).click()
  await expect(page.getByText(/No hemos encontrado ese canal.*@/)).toBeVisible()
  await audit(page)

  // The link of a video finds its channel; the creator can say it is not theirs.
  await field.fill('https://www.youtube.com/watch?v=co30v000xxx')
  await page.getByRole('button', { name: 'Buscar mi canal' }).click()
  await expect(heading(page, '¿Es este tu canal?')).toBeVisible()
  await expect(page.getByText('Cocina Corta')).toBeVisible()
  await expect(page.getByText('@cocinacorta30')).toBeVisible()
  await audit(page)
  await page.getByRole('button', { name: 'No, buscar otro' }).click()

  // The link of the channel, and its @.
  await expect(heading(page, 'Busca tu canal')).toBeVisible()
  await field.fill('https://www.youtube.com/channel/UCcocinacorta30000000000')
  await page.getByRole('button', { name: 'Buscar mi canal' }).click()
  await expect(page.getByText('@cocinacorta30')).toBeVisible()
  await page.getByRole('button', { name: 'No, buscar otro' }).click()
  await expect(heading(page, 'Busca tu canal')).toBeVisible()
  await field.fill('@cocinacorta30')
  await page.getByRole('button', { name: 'Buscar mi canal' }).click()
  await page.getByRole('button', { name: 'Sí, es mi canal' }).click()

  // The reading: figures by format as data, the best and the worst by times the normal.
  await expect(heading(page, 'Lo que hemos leído de tu canal')).toBeVisible()
  await expect(page.getByText('Hemos leído 30 vídeos')).toBeVisible()
  const long = page.getByRole('region', { name: 'Vídeos largos' })
  await expect(long.getByText(/veces lo normal en su canal/).first()).toBeVisible()
  await expect(long.getByText(/Dato de YouTube/).first()).toBeVisible()
  await expect(page.getByRole('region', { name: 'Shorts' })).toBeVisible()
  await audit(page)

  // Closing the app here keeps the journey at the same point.
  await page.reload()
  await expect(heading(page, 'Lo que hemos leído de tu canal')).toBeVisible()
  await expect(page.getByText('Hemos leído 30 vídeos')).toBeVisible()

  // The current profile cites videos, apart from the opinion.
  await page.getByRole('button', { name: /Ver mi perfil actual/ }).click()
  const profile = page.getByRole('region', { name: 'Tu perfil actual' })
  await expect(profile.getByText('Los títulos con el tiempo de la receta.')).toBeVisible()
  await expect(profile.getByText(/Cocina Corta: /).first()).toBeVisible()
  await expect(profile.getByText('Opinión de la IA').first()).toBeVisible()
  await audit(page)

  // Approved on purpose, as any proposal: until then there is nothing to go on to.
  await profile.getByRole('button', { name: 'Aprobar' }).click()

  // What only the creator can say: the hours, how to appear and where the audience is.
  await expect(heading(page, 'Tu ritmo')).toBeVisible()
  await audit(page)
  await page.getByLabel(/Horas por semana/).fill('8')
  await page.getByRole('radio', { name: 'Solo con mi voz' }).check()
  await page.getByRole('button', { name: 'Seguir' }).click()

  await expect(heading(page, 'Cómo enfocar tu canal')).toBeVisible()
  await expect(profile.getByRole('button', { name: 'Aprobar' })).toHaveCount(0)
  await audit(page)

  // The profile can be edited too.
  await profile.getByRole('button', { name: 'Editar' }).click()
  await profile.getByLabel('De qué va tu canal').fill('Recetas de diario para gente con prisa.')
  await audit(page)
  await profile.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(profile.getByText('Recetas de diario para gente con prisa.')).toBeVisible()

  // The proposal, whose cost shows on the button.
  await page.getByRole('button', { name: /Proponer cómo enfocarlo/ }).click()
  const proposal = page.getByRole('region', { name: 'Lo que te proponemos' })
  await expect(proposal.getByText('Centrar el canal en cenas rápidas.')).toBeVisible()
  await expect(proposal.getByRole('button', { name: 'Aprobar' })).toBeVisible()
  // The money, from its own videos and with what it supposes in sight; the hours, the answer.
  await expect(proposal.getByText(/€ al mes con anuncios/)).toBeVisible()
  await expect(proposal.getByText(/Supone unas .* visitas al mes/)).toBeVisible()
  await expect(proposal.getByText(/Un vídeo largo típico de tu canal consigue/)).toBeVisible()
  await expect(proposal.getByText(/unas 8 horas en total/)).toBeVisible()
  await audit(page)

  // Edits a topic of the channel and approves.
  await proposal.getByRole('button', { name: 'Editar' }).click()
  await proposal.getByLabel('Tema 1', { exact: true }).fill('Cenas de 15 minutos')
  await audit(page)
  await proposal.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(proposal.getByText('Cenas de 15 minutos')).toBeVisible()
  await proposal.getByRole('button', { name: 'Aprobar' }).click()

  // The channel is ready, with the same profile as a new one.
  await expect(page.getByRole('heading', { name: 'Cocina Corta' })).toBeVisible()
  const current = await page.evaluate(async () => (await fetch('/api/channels/current')).json())
  expect(current.profile).toMatchObject({ version: 1, origin: 'ia' })
  expect(current.profile.profile.concept.pillars[0].title).toBe('Cenas de 15 minutos')
  expect(current.profile.profile.niche.label).toBe('Recetas de diario para gente con prisa.')
  expect(current.profile.profile.concept.monetization.monthlyEurRange).not.toBeNull()
  expect(current.profile.profile.name).toMatchObject({ displayName: 'Cocina Corta', status: 'elegido' })
  expect(current.profile.profile.context.readingId).toBeTruthy()
})

test('a channel with 3 videos offers the new journey, keeping the name and the @ (FR-022)', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000)
  const other = await startServer({ port: 4383 })
  try {
    await blockExternal(context)
    await page.goto(other.baseURL)
    await toConnect(page, 'Usar mi suscripción de Claude')
    await connectAccount(page)
    await page.getByRole('button', { name: 'Continuar' }).click()
    await page.getByRole('button', { name: 'Ir al inicio' }).click()
    await page.getByRole('button', { name: 'Crear mi primer canal' }).click()
    await page.getByRole('button', { name: 'Ya tengo un canal' }).click()

    await page.getByLabel('El enlace de tu canal o su @').fill('@cocinatres')
    await page.getByRole('button', { name: 'Buscar mi canal' }).click()
    await page.getByRole('button', { name: 'Sí, es mi canal' }).click()

    await expect(page.getByText(/poca información/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Ver mi perfil actual/ })).toHaveCount(0)
    await audit(page)
    await page.getByRole('button', { name: 'Seguir como canal nuevo' }).click()

    await expect(heading(page, '¿Qué te interesa?')).toBeVisible()
    const current = await page.evaluate(async () => (await fetch('/api/channels/current')).json())
    expect(current.channel).toMatchObject({ displayName: 'Cocina en Tres', handle: 'cocinatres' })
    expect(current.journey).toMatchObject({ kind: 'nuevo', step: 'intereses' })
  } finally {
    await other.stop()
  }
})
