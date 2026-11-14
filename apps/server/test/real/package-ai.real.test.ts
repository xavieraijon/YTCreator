import { createRegistry } from '@ytcreator/ai'
import { formatKinds, reviewPackage, Secret, warningNotices } from '@ytcreator/core'
import { loadPublishKnowledge, promptFor } from '@ytcreator/knowledge'
import { describe, expect, it } from 'vitest'
import { createMemoryLogger } from '../../src/logging.ts'
import type { ActiveAi } from '../../src/services/ai-run.ts'
import { makeTestApp } from '../helpers.ts'
import { call, finished } from '../http/flows.ts'

// T068 of 006: the publishing package with the real AI, outside CI and only with the creator's authorization
// (`pnpm test:real-ai`). Only the Claude Code subscription: the API is never called here (no money is spent).
// The channel is set up with the fake AI, as in every test; from the scripts on, every request goes to Claude Code
// with the app's own prompts, inputs and schemas (through the real services). The secret is read here and never printed.
const SECRET = process.env['CLAUDE_CODE_OAUTH_TOKEN']
const TEN_MINUTES = 10 * 60 * 1000

const publish = loadPublishKnowledge()
const TITLE_MAX = publish.youtube.data.titleMaxChars.value
const MOBILE = publish.craft.data.mobileTitleChars.value

const report = (line: string) => process.stdout.write(`[real-ai] ${line}\n`)
const seconds = (ms: number) => Math.round(ms / 1000)

type T = ReturnType<typeof makeTestApp>
type Job = { status: string; failure: string | null } | null
type View = Record<string, unknown> & {
  job: Job
  warnings: string[]
  pieces: Record<string, { version: number; content: Record<string, unknown> } | null>
}

// Asks the AI through the app (estimate, then generate) and waits for the job, timed.
async function ask(t: T, path: string, use: string): Promise<Record<string, unknown>> {
  const estimate = await call(t, 'POST', `${path}/estimate`, { use })
  expect(estimate.status, `${use}: estimate`).toBe(200)
  expect(estimate.body['blockedBy'], `${use}: blocked`).toBeNull()
  const started = Date.now()
  const generate = await call(t, 'POST', `${path}/generate`, { use, estimateId: estimate.body['estimateId'] })
  expect(generate.status, `${use}: generate`).toBe(202)
  let view: Record<string, unknown> = {}
  while (Date.now() - started < TEN_MINUTES) {
    view = (await call(t, 'GET', path)).body
    if ((view['job'] as Job)?.status !== 'en_curso') break
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  const job = view['job'] as Job
  report(
    `${use}: ${job?.status ?? 'sin trabajo'}${job?.failure ? ` (${job.failure})` : ''} en ${seconds(Date.now() - started)} s`,
  )
  expect(job?.status, `${use}: job`).toBe('hecho')
  return view
}

const pending = (draft: { content: { claims: { status: string }[] } }) =>
  draft.content.claims.filter((claim) => claim.status === 'pendiente').length

async function approveDraft(t: T, scriptId: string, view: Record<string, unknown>) {
  const draft = view['draft'] as { version: number; content: { claims: { status: string }[] } }
  const approved = await call(t, 'POST', `/api/scripts/${scriptId}/draft/approve`, {
    version: draft.version,
    acknowledgedPending: pending(draft),
  })
  expect(approved.status).toBe(200)
}

function titlesReport(view: View) {
  const candidates = view.pieces['titulos']!.content['candidates'] as { id: string; text: string; why: string }[]
  const fitMobile = candidates.filter((one) => [...one.text].length <= MOBILE).length
  for (const one of candidates) {
    report(`  · (${[...one.text].length} car.) ${one.text} — ${one.why}`)
  }
  report(
    `  títulos: ${candidates.length}; dentro del máximo (${TITLE_MAX}): ` +
      `${candidates.filter((one) => [...one.text].length <= TITLE_MAX).length}; sin cortarse en el móvil (${MOBILE}): ` +
      `${fitMobile} (SC-002: 100 % y al menos la mitad)`,
  )
  expect(candidates.every((one) => [...one.text].length <= TITLE_MAX)).toBe(true)
  return { candidates, fitMobile }
}

async function reviewReport(t: T, id: string, view: View, format: 'largo' | 'short') {
  const rules = (await call(t, 'GET', `/api/packages/${id}/review`)).body['rules']
  const texts = view['texts'] as { chapters: { id: string; startSeconds: number }[]; assembled: string | null }
  const blocks = (view['script'] as { blocks: { seconds: number }[] }).blocks
  const notices = reviewPackage(
    {
      format,
      pieces: Object.fromEntries(formatKinds(format).map((kind) => [kind, view.pieces[kind]?.content ?? null])),
      chapters: texts.chapters,
      scriptSeconds: blocks.reduce((sum, block) => sum + block.seconds, 0),
      assembled: texts.assembled,
    },
    rules as Parameters<typeof reviewPackage>[1],
  )
  report(
    `  revisión: ${warningNotices(notices).length} avisos (${warningNotices(notices)
      .map((one) => one.rule)
      .join(', ')}); avisos del paquete: ${view.warnings.join(', ') || 'ninguno'}`,
  )
  if (texts.assembled) report(`  descripción montada (${[...texts.assembled].length} car.):\n${texts.assembled}`)
}

describe('real AI: the publishing package (006, T068)', () => {
  it.skipIf(!SECRET)(
    'a long video and a Short drawn from it, from the script to the package',
    async () => {
      const logger = createMemoryLogger(() => new Date())
      const descriptor = createRegistry({ env: process.env, allowFake: false, logger }).find(
        (one) => one.id === 'claude-code',
      )!
      const provider = descriptor.create(Secret.from(SECRET!), { fetch, now: () => new Date(), logger })
      const claude: ActiveAi = {
        providerId: 'claude-code',
        billing: descriptor.billing,
        webResearch: descriptor.webResearch,
        generate: (request) => provider.generate(request),
      }
      let real = false
      const t = makeTestApp({
        fakeAi: 'ok',
        aiOverride: { active: () => (real ? claude : null), promptFor: (use) => (real ? promptFor(use) : null) },
      })
      const { channelId } = await finished(t)
      real = true
      const everything = Date.now()

      // 1. The long script, written by the real AI (005), approved as it comes.
      const idea = await call(t, 'POST', `/api/channels/${channelId}/ideas`, {
        title: 'Pan de espelta sin amasar',
        format: 'largo',
      })
      const ideaId = (idea.body['idea'] as { id: string }).id
      await call(t, 'PATCH', `/api/ideas/${ideaId}`, { revision: 1, status: 'elegida' })
      const longId = (await call(t, 'POST', `/api/ideas/${ideaId}/script`)).body['id'] as string
      const outline = (await ask(t, `/api/scripts/${longId}`, 'escaleta'))['outline'] as { version: number }
      await call(t, 'POST', `/api/scripts/${longId}/outline/approve`, { version: outline.version })
      await approveDraft(t, longId, await ask(t, `/api/scripts/${longId}`, 'guion'))

      // 2. Its package: titles, thumbnails, then the texts (SC-001 counts from here).
      const packageStart = Date.now()
      const id = (await call(t, 'POST', `/api/scripts/${longId}/package`)).body['id'] as string
      let view = (await ask(t, `/api/packages/${id}`, 'titulos')) as View
      const { candidates } = titlesReport(view)
      view = (
        await call(t, 'PUT', `/api/packages/${id}/pieces/titulos`, {
          baseVersion: view.pieces['titulos']!.version,
          content: { ...view.pieces['titulos']!.content, main: candidates[0]!.id },
        })
      ).body as View
      view = (await ask(t, `/api/packages/${id}`, 'miniaturas')) as View
      const concepts = view.pieces['miniaturas']!.content['concepts'] as Record<string, string>[]
      for (const one of concepts) {
        report(`  · miniatura: ${one['scene']} | texto «${one['bigText']}» | ${one['emotion']} | ${one['colors']}`)
      }
      view = (
        await call(t, 'PUT', `/api/packages/${id}/pieces/miniaturas`, {
          baseVersion: view.pieces['miniaturas']!.version,
          content: { ...view.pieces['miniaturas']!.content, chosen: [concepts[0]!['id']] },
        })
      ).body as View
      const cover = await call(t, 'POST', `/api/packages/${id}/approve`, {
        step: 'portada',
        versions: { titulos: view.pieces['titulos']!.version, miniaturas: view.pieces['miniaturas']!.version },
      })
      expect(cover.status).toBe(200)
      view = (await ask(t, `/api/packages/${id}`, 'descripcion')) as View
      const chapters = (view['texts'] as { chapters: { title: string; startSeconds: number }[] }).chapters
      report(
        `  capítulos: ${chapters.map((one) => `${Math.floor(one.startSeconds / 60)}:${String(one.startSeconds % 60).padStart(2, '0')} ${one.title}`).join(' | ')}`,
      )
      const tags = (view.pieces['etiquetas']?.content['tags'] as string[] | undefined) ?? []
      report(`  etiquetas (${tags.length}): ${tags.join(', ')}`)
      report(`  comentario: ${(view.pieces['comentario']?.content['text'] as string | undefined) ?? '(ninguno)'}`)
      await reviewReport(t, id, view, 'largo')
      report(`vídeo largo: paquete en ${seconds(Date.now() - packageStart)} s de IA y servidor (sin la lectura)`)

      // 3. A Short drawn from the long video (005), and its package in one request (R9).
      await ask(t, `/api/scripts/${longId}`, 'enfoques_short')
      const chosen = await call(t, 'POST', `/api/scripts/${longId}/short-angles/0/choose`, {
        baseUpdatedAt: (await call(t, 'GET', `/api/scripts/${longId}`)).body['updatedAt'],
      })
      expect(chosen.status).toBe(201)
      const shortId = chosen.body['scriptId'] as string
      await approveDraft(t, shortId, await ask(t, `/api/scripts/${shortId}`, 'guion_short'))
      const shortStart = Date.now()
      const shortPackage = (await call(t, 'POST', `/api/scripts/${shortId}/package`)).body['id'] as string
      view = (await ask(t, `/api/packages/${shortPackage}`, 'paquete_short')) as View
      titlesReport(view)
      const shortCover = view.pieces['portada_short']?.content
      report(`  portada: ${shortCover?.['moment'] as string} | en pantalla «${shortCover?.['screenText'] as string}»`)
      const hashtags = (view.pieces['descripcion']?.content['hashtags'] as string[] | undefined) ?? []
      report(`  hashtags: ${hashtags.map((one) => `#${one}`).join(' ')}`)
      await reviewReport(t, shortPackage, view, 'short')
      report(`Short: paquete en ${seconds(Date.now() - shortStart)} s de IA y servidor`)

      // 4. What was spent: the subscription's quota, never money; the tokens give its size.
      for (const row of t.usage.list()) {
        if (row.providerId !== 'claude-code') continue
        report(
          `  gasto ${row.use}: ${row.outcome}, tokens ${row.inputTokens}/${row.outputTokens}, ${row.costCents} céntimos (cupo de la suscripción)`,
        )
      }
      // Proof that the AI was the real one: every request from the scripts on went to Claude Code.
      expect(t.usage.list().filter((row) => row.providerId === 'claude-code').length).toBeGreaterThanOrEqual(8)
      report(`total desde el guion: ${seconds(Date.now() - everything)} s`)
    },
    60 * 60 * 1000,
  )
})
