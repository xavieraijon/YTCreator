import { createRegistry } from '@ytcreator/ai'
import { Secret } from '@ytcreator/core'
import { promptFor } from '@ytcreator/knowledge'
import { describe, expect, it } from 'vitest'
import { createMemoryLogger } from '../../src/logging.ts'
import type { ActiveAi } from '../../src/services/ai-run.ts'
import { makeTestApp } from '../helpers.ts'
import { call, finished } from '../http/flows.ts'

// T076 of 007: the AI's review of the subtitles with the real AI, outside CI and only with the creator's authorization
// (`pnpm test:real-ai`). Only the Claude Code subscription: the API is never called here (no money is spent).
// The script is the one of T075 and the subtitles are what whisper heard of it there, with a few mistakes a recognizer
// makes added (spelling, accents, commas, full stops). The secret is read here and never printed.
const SECRET = process.env['CLAUDE_CODE_OAUTH_TOKEN']
const TEN_MINUTES = 10 * 60 * 1000

const report = (line: string) => process.stdout.write(`[real-ai] ${line}\n`)

const SCRIPT = [
  'Hola a todos, bienvenidos a Cuchara Viva. Hoy os enseño a hacer un pan de centeno en casa, sin amasar y con muy poca levadura.',
  'Necesitáis medio kilo de harina de centeno, 350 mililitros de agua tibia, 10 gramos de sal y una pizca de levadura fresca.',
  'Mezclad todo en un bol grande con una cuchara de madera y tapadlo con un paño limpio. Dejadlo reposar 12 horas en un rincón templado de la cocina.',
  'Pasado ese tiempo, dadle la vuelta sobre la mesa enharinada, formad una bola y horneadlo a 230 grados durante 40 minutos.',
  'Dejadlo enfriar sobre una rejilla antes de cortarlo. Si os ha gustado, contadme en los comentarios cómo os ha quedado. Hasta la próxima.',
]

interface Cue {
  id: string
  start: number
  end: number
  text: string
  flags: string[]
  heard: string | null
  reviewed: boolean
}
const cue = (id: string, start: number, end: number, text: string, extra: Partial<Cue> = {}): Cue => ({
  id,
  start,
  end,
  text,
  flags: [],
  heard: null,
  reviewed: false,
  ...extra,
})

// What whisper heard in T075, with mistakes added where the comment says. «Por cierto…» is improvised: not in the
// script, so the AI must leave its words as they are.
const CUES: Cue[] = [
  cue('c1', 1, 3.41, 'Hola a todos, bienvenidos a Cuchara Viva.'),
  // Comma lost after «casa».
  cue('c2', 3.5, 8.44, 'Hoy os enseño a hacer un pan de centeno en\ncasa sin amasar y con muy poca levadura.'),
  cue('c3', 9.09, 13.38, 'Necesitáis medio kilo de harina\nde centeno, 350 mililitros de agua tibia,'),
  cue('c4', 13.47, 15.12, '10 gramos de sal y una pizca'),
  // «Mezclad» misspelt.
  cue('c5', 15.2, 19.69, 'de levadura fresca. Mesclad todo\nen un bol grande con una cuchara'),
  // Full stop lost.
  cue('c6', 19.77, 22.01, 'de madera y tapadlo con un paño limpio'),
  cue('c7', 22.09, 26.95, 'Dejadlo reposar 12 horas en un rincón\ntemplado de la cocina. Por cierto,', {
    flags: ['del_guion'],
    heard: 'Dejadlo reposar 12 horas en un ricón\ntemplado de la cocina. Por cierto,',
  }),
  // Accent and comma lost, in the improvised sentence.
  cue('c8', 27.03, 30.44, 'mi abuela siempre decia\nque el pan con prisas sale triste'),
  cue('c9', 30.52, 34.32, 'y tenía toda la razón del mundo.\nPasado ese tiempo,'),
  // «enharinada» misspelt.
  cue('c10', 34.4, 39.23, 'dadle la vuelta sobre la mesa enarinada,\nformad una bola y horneadlo a 230 grados'),
  cue('c11', 39.31, 44.55, 'durante 40 minutos. Dejadlo enfriar\nsobre una rejilla antes de cortarlo.'),
  // Accent lost on «cómo».
  cue('c12', 44.63, 48.45, 'Si os ha gustado, contadme\nen los comentarios como os ha quedado.'),
  cue('c13', 48.53, 49.53, 'Hasta la próxima.'),
]

/** The words as said: no case, accents, signs or line breaks. A change that keeps them keeps what was said. */
const said = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)

// The misspellings added: writing them right changes their letters, not what was said.
const MISSPELT: Record<string, string> = { mesclad: 'mezclad', enarinada: 'enharinada' }

describe('real AI: the review of the subtitles (007, T076)', () => {
  it.skipIf(!SECRET)(
    'proposes how to write what was heard, never what was said',
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

      // 1. The script of T075, written over a draft made with the fake AI, and approved.
      const { channelId } = await finished(t)
      const idea = await call(t, 'POST', `/api/channels/${channelId}/ideas`, {
        title: 'Pan de centeno',
        format: 'largo',
      })
      const ideaId = (idea.body['idea'] as { id: string }).id
      await call(t, 'PATCH', `/api/ideas/${ideaId}`, { revision: 1, status: 'elegida' })
      const scriptId = (await call(t, 'POST', `/api/ideas/${ideaId}/script`)).body['id'] as string
      const askFake = async (use: string) => {
        const estimate = await call(t, 'POST', `/api/scripts/${scriptId}/estimate`, { use })
        await call(t, 'POST', `/api/scripts/${scriptId}/generate`, { use, estimateId: estimate.body['estimateId'] })
        for (;;) {
          const view = (await call(t, 'GET', `/api/scripts/${scriptId}`)).body
          if ((view['job'] as { status: string } | null)?.status !== 'en_curso') return view
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
      }
      const outline = (await askFake('escaleta'))['outline'] as { version: number }
      await call(t, 'POST', `/api/scripts/${scriptId}/outline/approve`, { version: outline.version })
      const draft = (await askFake('guion'))['draft'] as {
        version: number
        content: { blocks: { id: string; text: string }[]; claims: unknown[] }
      }
      // Only the text of each block can change (same blocks, same ids): the script is shared out among them, in order.
      const count = draft.content.blocks.length
      const blocks = draft.content.blocks.map((block, i) => ({
        ...block,
        text: SCRIPT.filter((_, k) => Math.floor((k * count) / SCRIPT.length) === i).join(' '),
      }))
      const saved = await call(t, 'PUT', `/api/scripts/${scriptId}/draft`, {
        baseVersion: draft.version,
        content: { blocks, claims: draft.content.claims },
      })
      expect(saved.status, JSON.stringify(saved.body)).toBe(200)
      const written = (saved.body['draft'] as { version: number }).version
      expect(
        (
          await call(t, 'POST', `/api/scripts/${scriptId}/draft/approve`, {
            version: written,
            acknowledgedPending: (
              saved.body['draft'] as { content: { claims: { status: string }[] } }
            ).content.claims.filter((claim) => claim.status === 'pendiente').length,
          })
        ).status,
      ).toBe(200)

      // 2. Its subtitles, as a recognition leaves them (version 1).
      const track = t.subtitleTracks.create({ channelId, scriptId, format: 'largo' })
      t.subtitleTracks.setAudio(track.id, { file: 'audio.wav', seconds: 50.8, sourceName: 'pan.mp4' })
      t.subtitleVersions.add({
        trackId: track.id,
        origin: 'reconocimiento',
        draftVersion: written,
        content: { cues: CUES, words: [{ text: 'Hola', start: 1, end: 1.21, p: 0.9 }], audioSeconds: 50.8 } as never,
      })

      // 3. The review, with the real AI: estimate, then generate, timed.
      real = true
      const base = `/api/scripts/${scriptId}/subtitles`
      const estimate = await call(t, 'POST', `${base}/estimate`, { use: 'revision_subtitulos' })
      expect(estimate.status).toBe(200)
      expect(estimate.body['blockedBy']).toBeNull()
      report(`estimación: ${JSON.stringify({ cents: estimate.body['cents'], billing: estimate.body['billing'] })}`)
      const started = Date.now()
      const generate = await call(t, 'POST', `${base}/generate`, {
        use: 'revision_subtitulos',
        estimateId: estimate.body['estimateId'],
        baseVersion: 1,
      })
      expect(generate.status, JSON.stringify(generate.body)).toBe(202)
      let view: Record<string, unknown> = {}
      while (Date.now() - started < TEN_MINUTES) {
        view = (await call(t, 'GET', base)).body
        if ((view['job'] as { status: string } | null)?.status !== 'en_curso') break
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
      const job = view['job'] as { status: string; failure: string | null } | null
      report(
        `revisión: ${job?.status}${job?.failure ? ` (${job.failure})` : ''} en ${Math.round((Date.now() - started) / 1000)} s`,
      )
      expect(job?.status).toBe('hecho')

      // 4. What it proposes, and whether any change alters what was said.
      const proposal = (view['aiProposal'] as { cueId: string; text: string; reason: string }[] | null) ?? []
      const altered: string[] = []
      for (const one of proposal) {
        const before = CUES.find((it) => it.id === one.cueId)!
        const was = said(before.text).map((word) => MISSPELT[word] ?? word)
        const now = said(one.text)
        const same = was.length === now.length && was.every((word, i) => word === now[i])
        if (!same) altered.push(one.cueId)
        report(
          `  · ${one.cueId}${same ? '' : ' [CAMBIA LO DICHO]'}: «${before.text.replace(/\n/g, ' / ')}» → «${one.text.replace(/\n/g, ' / ')}» (${one.reason})`,
        )
      }
      const fixed = ['c2', 'c5', 'c6', 'c8', 'c10', 'c12'].filter((id) => proposal.some((one) => one.cueId === id))
      report(
        `propuestas: ${proposal.length}; de los 6 errores añadidos, propone cambio en ${fixed.length} (${fixed.join(', ')}); cambian lo dicho: ${altered.length}`,
      )

      // 5. Accepting them all makes a version `ia` whose times are the same.
      const decided = await call(t, 'POST', `${base}/ai-proposal`, {
        baseVersion: 1,
        accept: proposal.map((one) => one.cueId),
      })
      expect(decided.status).toBe(200)
      const latest = decided.body['latest'] as { version: number; origin: string; content: { cues: Cue[] } }
      if (proposal.length > 0) expect(latest).toMatchObject({ version: 2, origin: 'ia' })
      expect(latest.content.cues.map((one) => [one.id, one.start, one.end])).toEqual(
        CUES.map((one) => [one.id, one.start, one.end]),
      )

      // 6. What was spent: the subscription's quota, never money.
      for (const row of t.usage.list()) {
        if (row.providerId !== 'claude-code') continue
        report(
          `  gasto ${row.use}: ${row.outcome}, tokens ${row.inputTokens}/${row.outputTokens}, ${row.costCents} céntimos (cupo de la suscripción)`,
        )
      }
      expect(t.usage.list().filter((row) => row.providerId === 'claude-code').length).toBeGreaterThanOrEqual(1)

      expect(altered, 'ningún cambio altera lo dicho').toEqual([])
      expect(fixed.length).toBeGreaterThanOrEqual(4)
    },
    30 * 60 * 1000,
  )
})
