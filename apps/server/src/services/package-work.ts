import { randomUUID } from 'node:crypto'
import {
  chapterTimes,
  fixedMinute,
  channelProfileSchema,
  emptyPiece,
  formatKinds,
  PACKAGE_CONTENT_SCHEMAS,
  PUBLISH_LIMITS,
  stepKinds,
  stepApproved,
  AI_THUMBNAILS,
  descriptionOutputFor,
  partOutputFor,
  shortPackageOutputFor,
  type ShortPackageOutput,
  proposeChapters,
  thumbnailsOutputFor,
  TITLE_COUNTS,
  type ChaptersContent,
  type DescriptionContent,
  type DescriptionOutput,
  type PackagePart,
  type PartOutput,
  titlesOutputFor,
  type ThumbnailConcept,
  type Idea,
  type KindVersions,
  type PackageContentOf,
  type PackageKind,
  type PackageOrigin,
  type PublishUse,
  type ThumbnailsContent,
  type ThumbnailsOutput,
  type TitlesContent,
  type TitlesOutput,
} from '@ytcreator/core'
import type {
  PackageApproveBody,
  PackageEstimateBody,
  PackageGenerateBody,
  PackageView,
  PieceSaveBody,
} from '@ytcreator/core/api'
import type { PublishKnowledge } from '@ytcreator/knowledge'
import type { z } from 'zod'
import type { JourneysRepo } from '../db/repos/journeys.ts'
import type { PackageVersionsRepo } from '../db/repos/package-versions.ts'
import type { PackagesRepo, PublishPackage } from '../db/repos/packages.ts'
import type { ProfilesRepo } from '../db/repos/profiles.ts'
import type { Script } from '../db/repos/scripts.ts'
import type { ScriptVersionsRepo } from '../db/repos/script-versions.ts'
import { ApiError } from '../http/errors.ts'
import type { AiRunService, PromptRef } from './ai-run.ts'
import { profileInput } from './ideas.ts'
import type { JobsService } from './jobs.ts'
import { mainTitleOf, type PackageService } from './packages.ts'

export interface PackageWorkDeps {
  service: PackageService
  packages: PackagesRepo
  versions: PackageVersionsRepo
  scriptVersions: ScriptVersionsRepo
  profiles: ProfilesRepo
  journeys: JourneysRepo
  jobs: JobsService
  aiRun: AiRunService
  promptFor: (use: PublishUse) => PromptRef
  knowledge: PublishKnowledge
}

// The kinds the creator can write by hand.
const EDITABLE: readonly PackageKind[] = [
  'titulos',
  'miniaturas',
  'portada_short',
  'descripcion',
  'capitulos',
  'etiquetas',
  'comentario',
]

/** What `paquete_short` brings besides the titles: while one is missing, it can be asked for (decision 82). */
const SHORT_PACKAGE_KINDS = ['portada_short', 'descripcion', 'etiquetas', 'comentario'] as const

/** What a job of the package is doing: a use, or one part asked for again (`parte_paquete:etiquetas`). */
export const jobOpOf = (use: PublishUse, part?: PackagePart) => (part ? `${use}:${part}` : use)
const scopeOf = (packageId: string, use: PublishUse, part?: PackagePart) => `${packageId}/${jobOpOf(use, part)}`

type Found = ReturnType<PackageService['find']>

// What the package does: asking the AI, saving what the creator writes and approving each step
// (specs/006-publishing-package/contracts/http-api.md).
export function createPackageWork(deps: PackageWorkDeps) {
  const { service, packages, versions, scriptVersions, aiRun } = deps

  const journeyOf = (channelId: string) => {
    const journey = deps.journeys.getLast(channelId)
    if (!journey) throw new ApiError({ code: 'no_encontrado' })
    return journey.id
  }

  const profileOf = (channelId: string) => {
    const current = deps.profiles.getCurrent(channelId)
    if (!current) throw new ApiError({ code: 'conflicto', fields: { profile: 'sin_perfil' } })
    return channelProfileSchema.parse(current.profile)
  }

  const scriptApproved = ({ idea }: Found) => service.scriptStatusOf(idea.id) === 'guion_aprobado'

  // The approved script: what everything is written from. Without it nothing is asked for (FR-001).
  const approvedDraft = (found: Found) => {
    const { script } = found
    if (!scriptApproved(found) || script.draftApprovedVersion === null) throw new ApiError({ code: 'sin_aprobar' })
    const draft = scriptVersions.get(script.id, 'guion', script.draftApprovedVersion)
    if (!draft) throw new ApiError({ code: 'sin_aprobar' })
    return { version: draft.version, blocks: draft.content.blocks }
  }

  // An edit made while the script is back in draft keeps the version it was made from.
  const draftVersionOf = (script: Script, pkg: PublishPackage, kind: PackageKind) =>
    script.draftApprovedVersion ?? versions.latest(pkg.id, kind)?.draftVersion ?? 1

  const assertBase = (latest: number | null, baseVersion: number) => {
    if ((latest ?? 0) !== baseVersion) throw new ApiError({ code: 'version_cambiada' })
  }

  /**
   * Minutes out of order, or too close, and YouTube shows no chapter at all. Next to a real minute (007) only the order
   * counts: the audio says where it is, and the review warns if it is short (decision 46).
   */
  const assertSpacing = (chapters: readonly { readonly fromAudio?: true }[], times: readonly number[]) => {
    const minSeconds = deps.knowledge.youtube.data.chapters.minSeconds.value
    const real = (index: number) => chapters[index]?.fromAudio === true
    const tooClose = times.some(
      (start, index) => index > 0 && start - times[index - 1]! < (real(index) || real(index - 1) ? 1 : minSeconds),
    )
    if (tooClose) throw new ApiError({ code: 'validacion', fields: { chapters: 'no_valido' } })
  }

  const addVersion = <K extends PackageKind>(
    pkg: PublishPackage,
    kind: K,
    origin: PackageOrigin,
    content: PackageContentOf<K>,
    extra: {
      draftVersion: number
      mainTitle?: string | null
      instructions?: string | null
      usageId?: string | null
      restoredFrom?: number | null
    },
    use?: PublishUse,
  ) => {
    const prompt = use ? deps.promptFor(use) : null
    versions.add({
      packageId: pkg.id,
      kind,
      origin,
      content,
      draftVersion: extra.draftVersion,
      mainTitle: extra.mainTitle ?? null,
      instructions: extra.instructions ?? null,
      usageId: extra.usageId ?? null,
      restoredFrom: extra.restoredFrom ?? null,
      promptId: prompt?.id ?? null,
      promptVersion: prompt?.version ?? null,
    })
    packages.touch(pkg.id)
  }

  const titlesOf = (pkg: PublishPackage) => versions.latest(pkg.id, 'titulos')?.content ?? null

  // The chosen ones, those the creator wrote and those a thumbnail idea is for stay; what else the AI proposed before
  // makes room for the new ones (decision 25). Asking again never leaves a thumbnail for a title that is gone; going
  // back to an older version may, and the screen says so (decision 96).
  const keptTitles = (pkg: PublishPackage) => {
    const titles = titlesOf(pkg)
    if (!titles) return []
    const thumbnails = versions.latest(pkg.id, 'miniaturas')?.content ?? null
    const chosen = new Set([
      ...(titles.main ? [titles.main] : []),
      ...titles.alternatives,
      ...(thumbnails?.concepts ?? []).flatMap((concept) => (concept.titleId ? [concept.titleId] : [])),
    ])
    return titles.candidates.filter((candidate) => chosen.has(candidate.id) || candidate.origin === 'creador')
  }

  // The chosen ones go last, right before the new ones, so that trimming to the limit never drops them.
  const keptConcepts = (thumbnails: ThumbnailsContent | null) => {
    if (!thumbnails) return []
    const chosen = new Set(thumbnails.chosen)
    const theirs = thumbnails.concepts.filter((concept) => !chosen.has(concept.id) && concept.origin === 'creador')
    return [...theirs, ...thumbnails.concepts.filter((concept) => chosen.has(concept.id))]
  }

  // Asking for more titles only makes sense if the fewest the AI gives fit in the list (decision 31).
  const titleRoom = (pkg: PublishPackage) => PUBLISH_LIMITS.candidates - keptTitles(pkg).length
  // The same for the thumbnail ideas: what the creator chose or edited is never trimmed to make room.
  const conceptRoom = (pkg: PublishPackage) =>
    PUBLISH_LIMITS.concepts - keptConcepts(versions.latest(pkg.id, 'miniaturas')?.content ?? null).length
  const assertRoom = (pkg: PublishPackage, use: PublishUse) => {
    const full = use === 'titulos' ? titleRoom(pkg) < TITLE_COUNTS[pkg.format].min : conceptRoom(pkg) < AI_THUMBNAILS
    if (full) throw new ApiError({ code: 'validacion', fields: { [use]: 'lleno' } })
  }

  const measuredInput = (view: PackageView) =>
    view.measured
      ? {
          query: view.measured.query,
          verdict: view.measured.verdict,
          similarTitles: view.measured.similarTitles,
          measuredAt: view.measured.measuredAt,
        }
      : null

  const limitsInput = () => {
    const { youtube, craft } = deps.knowledge
    return {
      titleMaxChars: youtube.data.titleMaxChars.value,
      mobileTitleChars: craft.data.mobileTitleChars.value,
      descriptionMaxChars: youtube.data.descriptionMaxChars.value,
      tagsMaxTotalChars: youtube.data.tagsMaxTotalChars.value,
      chapterMinSeconds: youtube.data.chapters.minSeconds.value,
      chapterMinCount: youtube.data.chapters.minCount.value,
      hashtagsShown: youtube.data.hashtags.shownAboveTitle.value,
    }
  }
  const textRules = () => {
    const { youtube } = deps.knowledge
    return {
      chapterMinCount: youtube.data.chapters.minCount.value,
      tagsMaxTotalChars: youtube.data.tagsMaxTotalChars.value,
      hashtagsShown: youtube.data.hashtags.shownAboveTitle.value,
    }
  }

  const coverApproved = (pkg: PublishPackage) =>
    stepApproved(pkg.format, 'portada', versions.latestNumbers(pkg.id), pkg.coverApproved)

  // The chapters of the AI, joined so that YouTube shows them all, each with its own id (R3, SC-003).
  const chaptersFrom = (
    proposed: readonly { title: string; blockIds: readonly string[] }[],
    found: Found,
    blocks: readonly { id: string; text: string }[],
  ) =>
    proposeChapters(
      proposed,
      blocks,
      service.paceOf(found.pkg.channelId),
      deps.knowledge.youtube.data.chapters.minSeconds.value,
    ).map((chapter) => ({
      id: randomUUID(),
      title: chapter.title,
      blockIds: [...chapter.blockIds],
      startSeconds: null,
      manual: false,
    }))

  // What can be asked for now: a use of this format, the texts once the cover is approved, a part that is there.
  const assertCanAsk = (found: Found, use: PublishUse, part: PackagePart | undefined) => {
    const { pkg } = found
    const kinds = formatKinds(pkg.format)
    if (use === 'paquete_short') {
      if (pkg.format !== 'short') throw new ApiError({ code: 'validacion', fields: { use: 'no_valido' } })
      // Once all of it is there, each piece is asked for again on its own: another tab would pay to write over them
      // (R9). While a piece is missing (titles made before, or written by hand), it brings what is missing.
      if (SHORT_PACKAGE_KINDS.every((kind) => versions.latest(pkg.id, kind)))
        throw new ApiError({ code: 'version_cambiada' })
      return
    }
    if (use === 'titulos' || use === 'miniaturas') {
      if (!kinds.includes(use)) throw new ApiError({ code: 'validacion', fields: { use: 'no_valido' } })
      // A Short's first titles come with its package, in the same request (R9).
      if (use === 'titulos' && pkg.format === 'short' && !titlesOf(pkg))
        throw new ApiError({ code: 'validacion', fields: { use: 'no_valido' } })
      assertRoom(pkg, use)
      return
    }
    if (use === 'descripcion') {
      // A Short gets its texts with `paquete_short` (R9).
      if (pkg.format !== 'largo') throw new ApiError({ code: 'validacion', fields: { use: 'no_valido' } })
      if (!coverApproved(pkg)) throw new ApiError({ code: 'sin_aprobar' })
      // Once the texts are there, each one is asked for again on its own: another tab would pay to write over them.
      if (stepKinds(pkg.format, 'textos').every((kind) => versions.latest(pkg.id, kind)))
        throw new ApiError({ code: 'version_cambiada' })
      return
    }
    if (!part || !kinds.includes(part) || !versions.latest(pkg.id, part))
      throw new ApiError({ code: 'validacion', fields: { part: 'no_valido' } })
    if (part !== 'portada_short' && !coverApproved(pkg)) throw new ApiError({ code: 'sin_aprobar' })
  }

  const ideaInput = (idea: Idea) => ({ title: idea.title, hook: idea.hook, format: idea.format })

  interface Request {
    input: Record<string, unknown>
    schema: z.ZodType
    keep: (value: unknown, usageId: string | null, instructions: string | null) => void
  }

  // The texts of a long video in one request, or one part of them asked for again on its own: only that part gets a
  // new version, and the fixed part is never the AI's (R5, R10, SC-005).
  const textsRequest = (
    found: Found,
    use: 'descripcion' | 'parte_paquete',
    part: PackagePart | undefined,
    profile: ReturnType<typeof profileInput>,
    draft: ReturnType<typeof approvedDraft>,
  ): Request => {
    const { pkg, idea, script } = found
    const main = mainTitleOf(titlesOf(pkg))
    const blocks = draft.blocks.map((block) => ({
      id: block.id,
      type: block.type,
      title: block.title,
      text: block.text,
    }))
    const blockIds = blocks.map((block) => block.id)
    const input = {
      mainTitle: main,
      idea: ideaInput(idea),
      draft: { blocks },
      profile,
      measured: measuredInput(service.view(pkg, script, idea)),
      limits: limitsInput(),
      craft: deps.knowledge.craft.data,
      // A Short names the long video it comes from, also when its description is asked for again (FR-018).
      parentTitle: pkg.format === 'short' ? service.view(pkg, script, idea).parentTitle : null,
    }
    const stamp = (instructions: string | null, usageId: string | null) => ({
      draftVersion: draft.version,
      mainTitle: main,
      instructions,
      usageId,
    })

    if (use === 'descripcion') {
      return {
        input,
        schema: descriptionOutputFor(blockIds, textRules()),
        keep: (value, usageId, instructions) => {
          const output = value as DescriptionOutput
          const extra = stamp(instructions, usageId)
          const fixedText = service.fixedTextOf(pkg.channelId).current
          addVersion(
            pkg,
            'descripcion',
            'ia',
            { firstLines: output.firstLines, body: output.body, hashtags: [], fixedText },
            extra,
            use,
          )
          addVersion(
            pkg,
            'capitulos',
            'ia',
            { chapters: chaptersFrom(output.chapters, found, draft.blocks) },
            extra,
            use,
          )
          addVersion(pkg, 'etiquetas', 'ia', { tags: output.tags }, extra, use)
          addVersion(pkg, 'comentario', 'ia', { text: output.comment }, extra, use)
        },
      }
    }

    const asked = part!
    // A part asked for again is kept as such: the history says so (FR-022, `parte_ia`).
    return {
      // `previous`, so that a figure in it is not taken as a source (ai-run.ts).
      input: { ...input, part: asked, previous: versions.latest(pkg.id, asked)?.content ?? null },
      schema: partOutputFor(asked, pkg.format, blockIds, textRules()),
      keep: (value, usageId, instructions) => {
        const extra = stamp(instructions, usageId)
        switch (asked) {
          case 'descripcion': {
            const output = value as PartOutput<'descripcion'>
            const before = versions.latest(pkg.id, 'descripcion')!.content
            addVersion(
              pkg,
              'descripcion',
              'parte_ia',
              {
                ...before,
                firstLines: output.firstLines,
                body: output.body,
                // An answer without hashtags leaves the ones there were: they are never emptied unsaid.
                hashtags: pkg.format === 'short' ? (output.hashtags ?? before.hashtags) : [],
              },
              extra,
              use,
            )
            return
          }
          case 'capitulos': {
            const output = value as PartOutput<'capitulos'>
            addVersion(
              pkg,
              'capitulos',
              'parte_ia',
              { chapters: chaptersFrom(output.chapters, found, draft.blocks) },
              extra,
              use,
            )
            return
          }
          case 'etiquetas':
            addVersion(pkg, 'etiquetas', 'parte_ia', { tags: (value as PartOutput<'etiquetas'>).tags }, extra, use)
            return
          case 'comentario':
            addVersion(pkg, 'comentario', 'parte_ia', { text: (value as PartOutput<'comentario'>).comment }, extra, use)
            return
          case 'portada_short':
            addVersion(pkg, 'portada_short', 'parte_ia', (value as PartOutput<'portada_short'>).cover, extra, use)
        }
      },
    }
  }

  // A Short's package in one request: each piece gets its own version, as if asked for one by one (R9). No main title
  // is chosen yet, so the texts are not written for one.
  const shortRequest = (
    found: Found,
    profile: ReturnType<typeof profileInput>,
    draft: ReturnType<typeof approvedDraft>,
    blocks: { id: string; type: string; title: string; text: string }[],
  ): Request => {
    const { pkg, idea, script } = found
    const view = service.view(pkg, script, idea)
    return {
      input: {
        idea: ideaInput(idea),
        draft: { blocks },
        profile,
        measured: measuredInput(view),
        limits: limitsInput(),
        craft: deps.knowledge.craft.data,
        // The main title of the long video's package, or its idea title: named, never linked (decision 10).
        parentTitle: view.parentTitle,
      },
      schema: shortPackageOutputFor(
        blocks.map((block) => block.id),
        textRules(),
      ),
      keep: (value, usageId, instructions) => {
        const output = value as ShortPackageOutput
        const extra = { draftVersion: draft.version, instructions, usageId }
        // Titles there were (chosen, or written by the creator) stay, as when asking for more (decision 25).
        const kept = keptTitles(pkg)
        const fresh = output.titles.map((title) => ({
          id: randomUUID(),
          text: title.text,
          why: title.why,
          blockId: title.blockId,
          origin: 'ia' as const,
        }))
        const latest = titlesOf(pkg)
        addVersion(
          pkg,
          'titulos',
          'ia',
          {
            candidates: [...kept, ...fresh.slice(0, PUBLISH_LIMITS.candidates - kept.length)],
            main: latest?.main ?? null,
            alternatives: latest?.alternatives ?? [],
          },
          extra,
          'paquete_short',
        )
        // Only what is missing: a piece already there is never written over (decision 82).
        const missing = (kind: PackageKind) => !versions.latest(pkg.id, kind)
        if (missing('portada_short')) addVersion(pkg, 'portada_short', 'ia', output.cover, extra, 'paquete_short')
        if (missing('descripcion'))
          addVersion(
            pkg,
            'descripcion',
            'ia',
            {
              firstLines: output.firstLines,
              body: output.body,
              hashtags: output.hashtags,
              fixedText: service.fixedTextOf(pkg.channelId).current,
            },
            extra,
            'paquete_short',
          )
        if (missing('etiquetas')) addVersion(pkg, 'etiquetas', 'ia', { tags: output.tags }, extra, 'paquete_short')
        if (missing('comentario')) addVersion(pkg, 'comentario', 'ia', { text: output.comment }, extra, 'paquete_short')
      },
    }
  }

  const requestFor = (found: Found, use: PublishUse, part?: PackagePart): Request => {
    const { pkg, idea, script } = found
    const draft = approvedDraft(found)
    const profile = profileInput(profileOf(pkg.channelId))
    const blocks = draft.blocks.map((block) => ({
      id: block.id,
      type: block.type,
      title: block.title,
      text: block.text,
    }))

    if (use === 'titulos') {
      const titles = titlesOf(pkg)
      return {
        input: {
          idea: ideaInput(idea),
          format: pkg.format,
          draft: { blocks },
          profile,
          measured: measuredInput(service.view(pkg, script, idea)),
          limits: limitsInput(),
          craft: deps.knowledge.craft.data,
          previous: (titles?.candidates ?? []).map((candidate) => candidate.text),
        },
        schema: titlesOutputFor(
          pkg.format,
          blocks.map((block) => block.id),
        ),
        keep: (value, usageId, instructions) => {
          const kept = keptTitles(pkg)
          const fresh = (value as TitlesOutput).titles.map((title) => ({
            id: randomUUID(),
            text: title.text,
            why: title.why,
            blockId: title.blockId,
            origin: 'ia' as const,
          }))
          const latest = titlesOf(pkg)
          addVersion(
            pkg,
            'titulos',
            'ia',
            {
              candidates: [...kept, ...fresh.slice(0, PUBLISH_LIMITS.candidates - kept.length)],
              main: latest?.main ?? null,
              alternatives: latest?.alternatives ?? [],
            },
            { draftVersion: draft.version, instructions, usageId },
            use,
          )
        },
      }
    }

    if (use === 'descripcion' || use === 'parte_paquete') return textsRequest(found, use, part, profile, draft)
    if (use === 'paquete_short') return shortRequest(found, profile, draft, blocks)

    // A thumbnail goes with a title: the main one has to be chosen first (FR-006).
    const titles = titlesOf(pkg)
    const main = mainTitleOf(titles)
    if (!titles || !main) throw new ApiError({ code: 'sin_aprobar' })
    const titleIds = [titles.main!, ...titles.alternatives]
    const textOf = (titleId: string) => titles.candidates.find((candidate) => candidate.id === titleId)!.text
    const thumbnails = versions.latest(pkg.id, 'miniaturas')?.content ?? null
    return {
      input: {
        mainTitle: main,
        alternatives: titles.alternatives.map(textOf),
        idea: ideaInput(idea),
        draft: { blocks: blocks.filter((block) => block.type === 'gancho' || block.type === 'cierre') },
        profile,
        craft: deps.knowledge.craft.data,
        previous: (thumbnails?.concepts ?? []).map((concept) => concept.scene),
      },
      schema: thumbnailsOutputFor(titleIds.length),
      keep: (value, usageId, instructions) => {
        const latest = versions.latest(pkg.id, 'miniaturas')?.content ?? null
        const fresh = (value as ThumbnailsOutput).concepts.map((concept) => ({
          id: randomUUID(),
          scene: concept.scene,
          bigText: concept.bigText,
          emotion: concept.emotion,
          composition: concept.composition,
          colors: concept.colors,
          titleId: titleIds[concept.titleIndex] ?? null,
          origin: 'ia' as const,
        }))
        const concepts = [...keptConcepts(latest), ...fresh].slice(-PUBLISH_LIMITS.concepts)
        addVersion(
          pkg,
          'miniaturas',
          'ia',
          {
            concepts,
            chosen: (latest?.chosen ?? []).filter((choice) => concepts.some((concept) => concept.id === choice)),
          },
          { draftVersion: draft.version, mainTitle: main, instructions, usageId },
          use,
        )
      },
    }
  }

  const estimate = (id: string, { use, part }: PackageEstimateBody) => {
    const found = service.find(id)
    assertCanAsk(found, use, part)
    const { input } = requestFor(found, use, part)
    // An estimate is for this package and this part: another part costs differently (Puerta A US2).
    return aiRun.estimate({
      journeyId: journeyOf(found.pkg.channelId),
      use,
      input,
      scope: scopeOf(found.pkg.id, use, part),
    })
  }

  // Runs in the background: the creator can close the tab and find the result on coming back (FR-020).
  const generate = (id: string, { use, part, estimateId, instructions }: PackageGenerateBody) => {
    const found = service.find(id)
    service.assertIdle(found.pkg)
    assertCanAsk(found, use, part)
    const journeyId = journeyOf(found.pkg.channelId)
    const scope = scopeOf(found.pkg.id, use, part)
    aiRun.assertEstimate(estimateId, use, journeyId, scope)
    const { input, keep, schema } = requestFor(found, use, part)
    const job = deps.jobs.start({ journeyId: null, channelId: found.pkg.channelId, kind: 'ia' }, async () => {
      const result = await aiRun.run({ estimateId, journeyId, scope, use, input, instructions, schema })
      if (!result.ok) return { failure: result.failure }
      keep(result.value, result.usageId, instructions ?? null)
      return undefined
    })
    packages.setJob(found.pkg.id, job.id, jobOpOf(use, part))
    return job.id
  }

  // What the creator writes is theirs: a text they rewrite is no longer the AI's, nor its reason or its block
  // (principle II). One they leave as it was keeps what the AI said, marked as its opinion.
  const titlesFromCreator = (sent: TitlesContent, before: TitlesContent | null): TitlesContent => {
    const known = new Map((before?.candidates ?? []).map((candidate) => [candidate.id, candidate]))
    return {
      ...sent,
      candidates: sent.candidates.map((candidate) => {
        const previous = known.get(candidate.id)
        return previous && previous.text === candidate.text
          ? previous
          : { id: candidate.id, text: candidate.text, why: '', blockId: null, origin: 'creador' as const }
      }),
    }
  }

  const sameConcept = (one: ThumbnailConcept, other: ThumbnailConcept) =>
    (['scene', 'bigText', 'emotion', 'composition', 'colors', 'titleId'] as const).every(
      (key) => one[key] === other[key],
    )

  const conceptsFromCreator = (
    sent: ThumbnailsContent,
    before: ThumbnailsContent | null,
    titles: TitlesContent | null,
  ): ThumbnailsContent => {
    const known = new Map((before?.concepts ?? []).map((concept) => [concept.id, concept]))
    const titleIds = new Set((titles?.candidates ?? []).map((candidate) => candidate.id))
    return {
      ...sent,
      concepts: sent.concepts.map((concept) => {
        const previous = known.get(concept.id)
        if (previous && sameConcept(previous, concept)) return previous
        // Only what the creator writes now is checked: an idea left as it was never blocks saving the others, and one
        // kept for a title that is gone (after going back to an older version, decision 96) can still be rewritten.
        if (concept.titleId !== null && concept.titleId !== previous?.titleId && !titleIds.has(concept.titleId))
          throw new ApiError({ code: 'validacion', fields: { titleId: 'no_valido' } })
        return { ...concept, origin: 'creador' as const }
      }),
    }
  }

  const savePiece = (id: string, kind: string, { baseVersion, content }: PieceSaveBody): PackageView => {
    const found = service.find(id)
    const { pkg, script } = found
    if (!EDITABLE.includes(kind as PackageKind) || !formatKinds(pkg.format).includes(kind as PackageKind))
      throw new ApiError({ code: 'validacion', fields: { kind: 'no_valido' } })
    service.assertIdle(pkg)
    const latest = versions.latest(pkg.id, kind as PackageKind)
    assertBase(latest?.version ?? null, baseVersion)
    const parsed = PACKAGE_CONTENT_SCHEMAS[kind as PackageKind].safeParse(content)
    if (!parsed.success) throw new ApiError({ code: 'validacion', fields: { content: 'no_valido' } })
    const draftVersion = draftVersionOf(script, pkg, kind as PackageKind)
    // The texts keep the title they were written for: an edit does not make them fit another one (R16).
    const keepTitle = { draftVersion, mainTitle: latest?.mainTitle ?? null }
    if (kind === 'descripcion') {
      const sent = parsed.data as DescriptionContent
      const before = (latest?.content as DescriptionContent | undefined) ?? null
      // The fixed part is the copy this description has, or the channel's one now («Usar la nueva», FR-010).
      const fixedOk =
        sent.fixedText === before?.fixedText || sent.fixedText === service.fixedTextOf(pkg.channelId).current
      if (!fixedOk) throw new ApiError({ code: 'validacion', fields: { fixedText: 'no_valido' } })
      // Hashtags only in a Short (decision 9).
      if (pkg.format !== 'short' && sent.hashtags.length > 0)
        throw new ApiError({ code: 'validacion', fields: { hashtags: 'no_valido' } })
      addVersion(pkg, 'descripcion', 'edicion', sent, keepTitle)
    } else if (kind === 'capitulos') {
      // A minute is the creator's (`manual`), the real one (`fromAudio`, 007) or worked out from the script: never a stale
      // one in between (R3).
      const sent = parsed.data as ChaptersContent
      // A real minute only comes from the subtitles (007): here it can be kept as it was, never made up.
      const realBefore = new Map(
        ((latest?.content as ChaptersContent | undefined)?.chapters ?? [])
          .filter((chapter) => chapter.fromAudio === true)
          .map((chapter) => [chapter.id, chapter.startSeconds]),
      )
      if (
        sent.chapters.some(
          (chapter) => chapter.fromAudio === true && realBefore.get(chapter.id) !== chapter.startSeconds,
        )
      )
        throw new ApiError({ code: 'validacion', fields: { chapters: 'no_valido' } })
      const chapters = sent.chapters.map((chapter) =>
        fixedMinute(chapter) ? chapter : { ...chapter, startSeconds: null },
      )
      const times = chapterTimes(
        chapters,
        service.approvedDraftOf(script)?.content.blocks ?? [],
        service.paceOf(pkg.channelId),
      )
      assertSpacing(chapters, times)
      addVersion(pkg, 'capitulos', 'edicion', { chapters }, keepTitle)
    } else if (kind === 'portada_short') {
      const sent = parsed.data as PackageContentOf<'portada_short'>
      const before = (latest?.content as PackageContentOf<'portada_short'> | undefined) ?? null
      // Only a block chosen now is checked: one kept from before stays, even if the script changed since (it warns).
      const blocks = service.approvedDraftOf(script)?.content.blocks ?? []
      if (
        sent.blockId !== null &&
        sent.blockId !== before?.blockId &&
        !blocks.some((block) => block.id === sent.blockId)
      )
        throw new ApiError({ code: 'validacion', fields: { blockId: 'no_valido' } })
      addVersion(pkg, 'portada_short', 'edicion', sent, keepTitle)
    } else if (kind === 'etiquetas' || kind === 'comentario') {
      addVersion(pkg, kind, 'edicion', parsed.data as PackageContentOf<typeof kind>, keepTitle)
    } else if (kind === 'titulos') {
      addVersion(pkg, 'titulos', 'edicion', titlesFromCreator(parsed.data as TitlesContent, titlesOf(pkg)), {
        draftVersion,
      })
    } else {
      const titles = titlesOf(pkg)
      const before = (latest?.content as ThumbnailsContent | undefined) ?? null
      const next = conceptsFromCreator(parsed.data as ThumbnailsContent, before, titles)
      // Choosing is not remaking: the ideas keep the title they were made for, and so does its warning (R16).
      const sameIdeas =
        before !== null &&
        before.concepts.length === next.concepts.length &&
        next.concepts.every((concept, index) => concept === before.concepts[index])
      addVersion(pkg, 'miniaturas', 'edicion', next, {
        draftVersion,
        mainTitle: sameIdeas ? (latest?.mainTitle ?? null) : mainTitleOf(titles),
      })
    }
    return service.read(pkg.id)
  }

  // Going back is a copy as the newest: nothing is lost (FR-020 of 005, SC-008). What it was written for goes with it,
  // so its notices stay true (R16); and as a new version, an approved step or package is back in draft (FR-015).
  const restoreVersion = (id: string, kind: PackageKind, number: number, baseVersion: number): PackageView => {
    const { pkg } = service.find(id)
    service.assertIdle(pkg)
    const latest = versions.latest(pkg.id, kind)
    assertBase(latest?.version ?? null, baseVersion)
    const older = versions.get(pkg.id, kind, number)
    if (!older) throw new ApiError({ code: 'no_encontrado' })
    if (older.version !== latest?.version) {
      addVersion(pkg, kind, 'recuperada', older.content, {
        draftVersion: older.draftVersion,
        mainTitle: older.mainTitle,
        instructions: older.instructions,
        restoredFrom: older.version,
      })
    }
    return service.read(pkg.id)
  }

  // A step is approved in the versions on screen: if another tab changed one, nothing is approved (R2).
  const approve = (id: string, body: PackageApproveBody): PackageView => {
    const { step, versions: sent } = body
    const found = service.find(id)
    const { pkg } = found
    service.assertIdle(pkg)
    if (!scriptApproved(found)) throw new ApiError({ code: 'sin_aprobar' })
    if (step === 'paquete') return approvePackage(found, body)
    const latest = versions.latestNumbers(pkg.id)
    if (step === 'textos' && !stepApproved(pkg.format, 'portada', latest, pkg.coverApproved))
      throw new ApiError({ code: 'sin_aprobar' })
    const kinds = stepKinds(pkg.format, step)
    if (kinds.some((kind) => sent[kind] !== latest[kind])) throw new ApiError({ code: 'version_cambiada' })
    assertNotEmpty(pkg, kinds)
    const approved: KindVersions = Object.fromEntries(kinds.map((kind) => [kind, latest[kind]!]))
    packages.approveStep(pkg.id, step, approved)
    return service.read(pkg.id)
  }

  const assertNotEmpty = (pkg: PublishPackage, kinds: readonly PackageKind[]) => {
    const empty = kinds.filter((kind) => {
      const piece = versions.latest(pkg.id, kind)
      return !piece || emptyPiece(kind, piece.content)
    })
    if (empty.length > 0)
      throw new ApiError({
        code: 'validacion',
        fields: Object.fromEntries(empty.map((kind) => [kind, 'no_valido' as const])),
      })
  }

  // The whole package, once both steps are approved in their last versions (R2). No notice stops it, but the creator
  // approves knowing how many are left: the count on screen has to be the one worked out here (FR-013).
  const approvePackage = (found: Found, { versions: sent, acknowledgedWarnings }: PackageApproveBody) => {
    const { pkg, script } = found
    const latest = versions.latestNumbers(pkg.id)
    const kinds = formatKinds(pkg.format)
    if (kinds.some((kind) => sent[kind] !== latest[kind])) throw new ApiError({ code: 'version_cambiada' })
    if (
      !stepApproved(pkg.format, 'portada', latest, pkg.coverApproved) ||
      !stepApproved(pkg.format, 'textos', latest, pkg.textsApproved)
    )
      throw new ApiError({ code: 'sin_aprobar' })
    assertNotEmpty(pkg, kinds)
    const view = service.read(pkg.id)
    const warnings = service.warningsCount(view)
    if ((acknowledgedWarnings ?? 0) !== warnings)
      throw new ApiError({ code: 'validacion', fields: { acknowledgedWarnings: 'no_valido' } })
    const approved: KindVersions = Object.fromEntries(kinds.map((kind) => [kind, latest[kind]!]))
    packages.approvePackage(pkg.id, approved, warnings, script.draftApprovedVersion!)
    return service.read(pkg.id)
  }

  /**
   * The minutes of some chapters, from the subtitles (007, R13): `fromAudio` is the real one, any other is written by the
   * creator. A new version of the chapters, like an edit, so an approved package is back in draft (FR-015). A short one
   * next to a real minute is kept and the review warns of it; a written one keeps the minimum of 006.
   */
  const saveChapterMinutes = (
    id: string,
    baseVersion: number,
    minutes: readonly { chapterId: string; seconds: number; fromAudio: boolean }[],
    removed: readonly string[] = [],
  ): PackageView => {
    const { pkg, script } = service.find(id)
    if (pkg.format !== 'largo') throw new ApiError({ code: 'no_encontrado' })
    service.assertIdle(pkg)
    const latest = versions.latest(pkg.id, 'capitulos')
    assertBase(latest?.version ?? null, baseVersion)
    if (!latest) throw new ApiError({ code: 'no_encontrado' })
    const chapters = latest.content.chapters
    const byId = new Map(minutes.map((minute) => [minute.chapterId, minute]))
    const gone = new Set(removed)
    const exists = (chapterId: string) => chapters.some((chapter) => chapter.id === chapterId)
    const known = minutes.every((minute) => exists(minute.chapterId)) && removed.every(exists)
    // The first chapter is always at 0:00, as YouTube asks, and is never removed.
    const first = chapters[0] ? byId.get(chapters[0].id) : undefined
    if (
      !known ||
      byId.size !== minutes.length ||
      gone.size !== removed.length ||
      (first !== undefined && first.seconds !== 0) ||
      (chapters[0] !== undefined && gone.has(chapters[0].id)) ||
      removed.some((chapterId) => byId.has(chapterId))
    )
      throw new ApiError({ code: 'validacion', fields: { accept: 'no_valido' } })
    if (minutes.length === 0 && removed.length === 0) return service.read(pkg.id)
    const placed = chapters.map((chapter) => {
      const minute = byId.get(chapter.id)
      if (!minute) return chapter
      const { id: chapterId, title, blockIds } = chapter
      return minute.fromAudio
        ? { id: chapterId, title, blockIds, startSeconds: minute.seconds, manual: false, fromAudio: true as const }
        : { id: chapterId, title, blockIds, startSeconds: minute.seconds, manual: true }
    })
    // A chapter cut in the edit is removed: its blocks join the chapter before, so every block keeps one (R3 of 006).
    const next: typeof placed = []
    for (const chapter of placed) {
      const before = next.at(-1)
      if (gone.has(chapter.id) && before)
        next[next.length - 1] = { ...before, blockIds: [...before.blockIds, ...chapter.blockIds] }
      else next.push(chapter)
    }
    const times = chapterTimes(
      next,
      service.approvedDraftOf(script)?.content.blocks ?? [],
      service.paceOf(pkg.channelId),
    )
    assertSpacing(next, times)
    addVersion(
      pkg,
      'capitulos',
      'edicion',
      { chapters: next },
      {
        draftVersion: draftVersionOf(script, pkg, 'capitulos'),
        mainTitle: latest.mainTitle,
      },
    )
    return service.read(pkg.id)
  }

  return { estimate, generate, savePiece, approve, restoreVersion, saveChapterMinutes }
}

export type PackageWork = ReturnType<typeof createPackageWork>
