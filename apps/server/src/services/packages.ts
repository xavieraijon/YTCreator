import {
  assembleDescription,
  channelProfileSchema,
  chapterTimes,
  DEFAULT_SCRIPT_SETTINGS,
  defaultFixedText,
  descriptionSources,
  durationSeconds,
  formatChapterTime,
  formatKinds,
  briefFileName,
  packageFileName,
  packagesFileName,
  reviewPackage,
  studioChecklist,
  warningNotices,
  type PackageExportItem,
  type PackageReviewFigures,
  type PackageReviewNotice,
  type PieceContents,
  PACKAGE_KINDS,
  packageStatus,
  packageWarnings,
  type Idea,
  type PackageKind,
  type ScriptStatus,
  type TitlesContent,
} from '@ytcreator/core'
import type {
  PackagePieces,
  PackageSummary,
  PackageView,
  PublishSettingsBody,
  PublishSettingsView,
} from '@ytcreator/core/api'
import type { PublishKnowledge } from '@ytcreator/knowledge'
import type { ChannelsRepo } from '../db/repos/channels.ts'
import type { IdeaMeasuresRepo } from '../db/repos/idea-measures.ts'
import type { IdeasRepo } from '../db/repos/ideas.ts'
import type { Job, JobsRepo } from '../db/repos/jobs.ts'
import type { PackageVersion, PackageVersionsRepo } from '../db/repos/package-versions.ts'
import type { PackagesRepo, PublishPackage } from '../db/repos/packages.ts'
import type { ProfilesRepo } from '../db/repos/profiles.ts'
import type { Script, ScriptsRepo } from '../db/repos/scripts.ts'
import type { ScriptVersionsRepo } from '../db/repos/script-versions.ts'
import { ApiError } from '../http/errors.ts'

export interface PackageServiceDeps {
  channels: ChannelsRepo
  ideas: IdeasRepo
  measures: IdeaMeasuresRepo
  jobsRepo: JobsRepo
  scripts: ScriptsRepo
  scriptVersions: ScriptVersionsRepo
  packages: PackagesRepo
  versions: PackageVersionsRepo
  profiles: ProfilesRepo
  /** The status of a script as 005 works it out. */
  scriptStatus: (ideaId: string) => ScriptStatus | null
  knowledge: PublishKnowledge
  /** What marking a video as made for children means, from `market/made-for-kids.json` (R12, never copied). */
  kids: { implications: readonly string[]; source: { label: string; date: string } }
}

const LIVE = 'en_curso'
// What 004 measured goes to the AI as examples, never copied (R7).
const SIMILAR_TITLES = 10

const pieceOf = (version: PackageVersion | null) =>
  version
    ? {
        version: version.version,
        origin: version.origin,
        createdAt: version.createdAt,
        draftVersion: version.draftVersion,
        mainTitle: version.mainTitle,
        instructions: version.instructions,
        restoredFrom: version.restoredFrom,
        content: version.content,
      }
    : null

/** The text of the main title, if one was chosen. */
export const mainTitleOf = (titles: TitlesContent | null | undefined): string | null => {
  if (!titles || titles.main === null) return null
  return titles.candidates.find((candidate) => candidate.id === titles.main)?.text ?? null
}

// What every route of the package needs: reading it, and the rules on what it may do now.
export function createPackageService(deps: PackageServiceDeps) {
  const { channels, ideas, measures, jobsRepo, scripts, scriptVersions, packages, versions } = deps

  const channelOf = (channelId: string) => {
    const channel = channels.get(channelId)
    if (!channel) throw new ApiError({ code: 'no_encontrado' })
    return channel
  }

  const scriptAndIdea = (scriptId: string) => {
    const script = scripts.get(scriptId)
    if (!script) throw new ApiError({ code: 'no_encontrado' })
    const idea = ideas.get(script.ideaId)
    if (!idea) throw new ApiError({ code: 'no_encontrado' })
    return { script, idea }
  }

  const find = (id: string) => {
    const pkg = packages.get(id)
    if (!pkg) throw new ApiError({ code: 'no_encontrado' })
    channelOf(pkg.channelId)
    return { pkg, ...scriptAndIdea(pkg.scriptId) }
  }

  const jobOf = (pkg: PublishPackage): Job | null => (pkg.jobId ? jobsRepo.get(pkg.jobId) : null)

  // One job at a time, and nothing changes under it (as in 005).
  const assertIdle = (pkg: PublishPackage) => {
    const job = jobOf(pkg)
    if (job?.status === LIVE) throw new ApiError({ code: 'en_curso', jobId: job.id })
  }

  const piecesOf = (pkg: PublishPackage) =>
    Object.fromEntries(PACKAGE_KINDS.map((kind) => [kind, versions.latest(pkg.id, kind)])) as {
      [K in PackageKind]: PackageVersion<K> | null
    }

  const statusOf = (pkg: PublishPackage) =>
    packageStatus({
      format: pkg.format,
      latest: versions.latestNumbers(pkg.id),
      cover: pkg.coverApproved,
      texts: pkg.textsApproved,
      approved: pkg.packageApproved,
    })

  // Only to name the package: a version that no longer reads falls back to the working title, so one broken row does
  // not take the whole list down with it (as `latestNumbers` does for the status).
  const mainTitle = (pkg: PublishPackage) => {
    try {
      return mainTitleOf(versions.latest(pkg.id, 'titulos')?.content)
    } catch {
      return null
    }
  }

  const paceOf = (channelId: string) => (scripts.settings(channelId) ?? DEFAULT_SCRIPT_SETTINGS).wordsPerMinute
  const approvedDraftOf = (script: Script) =>
    script.draftApprovedVersion === null ? null : scriptVersions.get(script.id, 'guion', script.draftApprovedVersion)

  // The blocks of the approved draft, with how long each one lasts at the channel's pace (R3).
  const blocksOf = (script: Script) => {
    const pace = paceOf(script.channelId)
    return (approvedDraftOf(script)?.content.blocks ?? []).map((block) => ({
      id: block.id,
      type: block.type,
      title: block.title,
      seconds: durationSeconds(block.text, pace),
    }))
  }

  // The sources of the description: from the facts the approved script used, never from the AI (R4).
  const sourcesOf = (script: Script) => {
    const draft = approvedDraftOf(script)
    if (!draft || draft.factsVersion === null) return []
    return descriptionSources(scriptVersions.get(script.id, 'hechos', draft.factsVersion)?.content.facts ?? [])
  }

  // Only what 004 measured (R7): the last measure that did measure, with where and when it was taken.
  const measuredOf = (idea: Idea): PackageView['measured'] => {
    const latest = measures.latestMeasured(idea.id)
    if (!latest) return null
    return {
      query: latest.queries.query,
      verdict: latest.verdict,
      similarTitles: latest.similarVideos.slice(0, SIMILAR_TITLES).map((video) => video.title),
      measuredAt: latest.measuredAt,
      source: latest.source,
      partial: latest.partial,
      olderRevision: latest.ideaRevision < idea.revision,
    }
  }

  // A Short drawn from a long video names it: by its main title once it has one.
  const parentTitleOf = (script: Script): string | null => {
    if (!script.sourceScriptId) return null
    const parent = scripts.get(script.sourceScriptId)
    if (!parent) return null
    const parentPackage = packages.getByScript(parent.id)
    return (parentPackage && mainTitle(parentPackage)) ?? ideas.get(parent.ideaId)?.title ?? null
  }

  const profileOf = (channelId: string) => {
    const parsed = channelProfileSchema.safeParse(deps.profiles.getCurrent(channelId)?.profile)
    return parsed.success ? parsed.data : null
  }

  // A profile that does not read has no @ to build the link with: the default is then empty, as without one.
  const handleOf = (channelId: string) => {
    const name = profileOf(channelId)?.name
    // Only a name the creator chose: a provisional one may not be theirs on YouTube.
    return name?.status === 'elegido' ? name.handle : null
  }

  // The fixed part of the channel: the one it saved, or the subscription link by default (R6, decision 7).
  const fixedTextOf = (channelId: string) => {
    const saved = packages.settings(channelId)
    return saved
      ? { current: saved.fixedText, isDefault: false }
      : { current: defaultFixedText(handleOf(channelId)), isDefault: true }
  }

  const settingsOf = (channelId: string): PublishSettingsView => {
    channelOf(channelId)
    const { category } = deps.knowledge.studio.data
    const saved = packages.settings(channelId)
    const fixed = fixedTextOf(channelId)
    return {
      fixedText: fixed.current,
      category: saved?.category ?? null,
      isDefault: fixed.isDefault,
      hasHandle: handleOf(channelId) !== null,
      suggestedCategory: category.suggested.value,
      categories: [...category.list],
    }
  }

  // Changing them never touches a version already saved: each description keeps its own copy (FR-010).
  const saveSettings = (channelId: string, body: PublishSettingsBody): PublishSettingsView => {
    channelOf(channelId)
    if (body.category !== null && !deps.knowledge.studio.data.category.list.includes(body.category))
      throw new ApiError({ code: 'validacion', fields: { category: 'no_valido' } })
    packages.saveSettings(channelId, { fixedText: body.fixedText, category: body.category })
    return settingsOf(channelId)
  }

  // The chapters with when each one starts, and the description as it is copied (R3, R5).
  const textsOf = (pkg: PublishPackage, script: Script, pieces: ReturnType<typeof piecesOf>): PackageView['texts'] => {
    const draftBlocks = approvedDraftOf(script)?.content.blocks ?? []
    const chapters = pieces.capitulos?.content.chapters ?? []
    const times = chapterTimes(chapters, draftBlocks, paceOf(script.channelId))
    const timed = chapters.map((chapter, index) => ({
      id: chapter.id,
      title: chapter.title,
      blockIds: chapter.blockIds,
      startSeconds: times[index]!,
      manual: chapter.manual,
      time: formatChapterTime(times[index]!),
    }))
    const sources = sourcesOf(script)
    const description = pieces.descripcion?.content
    return {
      chapters: timed,
      sources,
      // A Short names the long video it comes from (FR-018).
      assembled: description
        ? assembleDescription(description, timed, sources, pkg.format === 'short' ? parentTitleOf(script) : null)
        : null,
      fixedText: fixedTextOf(pkg.channelId),
    }
  }

  const limitsOf = (): PackageView['limits'] => {
    const { youtube, craft } = deps.knowledge
    const title = youtube.data.titleMaxChars
    const description = youtube.data.descriptionMaxChars
    // The maximum is cited with its own source, never with another one by default (principle V).
    const source = 'source' in title ? youtube.source[title.source] : undefined
    if (!source) throw new Error('The maximum length of a title needs its source in publish/youtube.json')
    const hashtags = youtube.data.hashtags.shownAboveTitle
    const hashtagsSource = 'source' in hashtags ? youtube.source[hashtags.source] : undefined
    if (!hashtagsSource) throw new Error('The hashtags shown need their source in publish/youtube.json')
    return {
      titleMaxChars: title.value,
      mobileTitleChars: craft.data.mobileTitleChars.value,
      descriptionMaxChars: description.value,
      youtube: { label: source.label, date: youtube.reviewedAt },
      hashtagsShown: hashtags.value,
      hashtags: { label: hashtagsSource.label, date: youtube.reviewedAt },
    }
  }

  // The guided list of YouTube Studio (R12). Without a profile that reads, the audience is not for children and its
  // language is the general one, as the profile itself starts (003).
  const studioOf = (channelId: string): PackageView['studio'] => {
    const audience = profileOf(channelId)?.concept.audience
    const { studio } = deps.knowledge
    const cited = (index: number) => {
      const source = studio.source[index]
      if (!source) throw new Error('publish/studio.json names a source it does not have')
      return { label: source.label, date: studio.reviewedAt }
    }
    // Each setting with where its answer comes from (principle V); `null`, an assumption that its text already says.
    const sourceOf = {
      publico_infantil: cited(studio.data.madeForKids.source),
      contenido_sintetico: cited(studio.data.synthetic.source),
      idioma: null,
      categoria: null,
    }
    return studioChecklist(
      {
        // Without a profile that reads, the app does not know: it never answers for the creator (principle II).
        audience: { madeForKids: audience?.madeForKids ?? null, region: audience?.region ?? 'mixto' },
        category: packages.settings(channelId)?.category ?? null,
      },
      studio.data,
      deps.kids.implications,
    ).map((item) => ({
      ...item,
      source: sourceOf[item.key],
      ...(item.key === 'publico_infantil' ? { implicationsSource: deps.kids.source } : {}),
    })) as PackageView['studio']
  }

  /** The figures of the review, read from `publish/youtube.json` and `publish/craft.json` (R13). */
  const reviewFigures = (): PackageReviewFigures => {
    const { youtube, craft } = deps.knowledge
    return {
      titleMaxChars: youtube.data.titleMaxChars.value,
      mobileTitleChars: craft.data.mobileTitleChars.value,
      descriptionMaxChars: youtube.data.descriptionMaxChars.value,
      tagsMaxTotalChars: youtube.data.tagsMaxTotalChars.value,
      chapterMinCount: youtube.data.chapters.minCount.value,
      chapterMinSeconds: youtube.data.chapters.minSeconds.value,
      hashtagsShown: youtube.data.hashtags.shownAboveTitle.value,
    }
  }

  /** Where each figure of the review comes from: its own source, never another one (principle V). */
  const reviewSources = () => {
    const { youtube, craft } = deps.knowledge
    const citedIn = (file: typeof youtube | typeof craft) => (basis: { source: number } | { assumption: true }) => {
      if (!('source' in basis)) return null
      const source = file.source[basis.source]
      if (!source) throw new Error('A figure of publish/*.json names a source it does not have')
      return { label: source.label, date: file.reviewedAt }
    }
    const cited = citedIn(youtube)
    const { data } = youtube
    return {
      titleMaxChars: cited(data.titleMaxChars),
      // Today an assumption of `craft.json`: YouTube does not publish it.
      mobileTitleChars: citedIn(craft)(craft.data.mobileTitleChars),
      descriptionMaxChars: cited(data.descriptionMaxChars),
      tagsMaxTotalChars: cited(data.tagsMaxTotalChars),
      chapterFirstAtZero: cited(data.chapters.firstAtZero),
      chapterMinCount: cited(data.chapters.minCount),
      chapterMinSeconds: cited(data.chapters.minSeconds),
      hashtagsShown: cited(data.hashtags.shownAboveTitle),
    }
  }

  /** The review of a package as the screen works it out, so the server counts the same notices (FR-013). */
  const reviewOf = (view: PackageView): PackageReviewNotice[] =>
    reviewPackage(
      {
        format: view.format,
        pieces: Object.fromEntries(
          formatKinds(view.format).map((kind) => [kind, view.pieces[kind]?.content ?? null]),
        ) as PieceContents,
        chapters: view.texts.chapters,
        scriptSeconds: view.script.blocks.reduce((sum, block) => sum + block.seconds, 0),
        assembled: view.texts.assembled,
      },
      reviewFigures(),
    )

  /** How many notices the creator is told about before approving: the review's and the package's own (FR-013). */
  const warningsCount = (view: PackageView) => warningNotices(reviewOf(view)).length + view.warnings.length

  const view = (pkg: PublishPackage, script: Script, idea: Idea): PackageView => {
    const pieces = piecesOf(pkg)
    const job = jobOf(pkg)
    const texts = textsOf(pkg, script, pieces)
    const scriptStatus = deps.scriptStatus(idea.id)
    const made = PACKAGE_KINDS.flatMap((kind) => {
      const piece = pieces[kind]
      return piece ? [{ kind, draftVersion: piece.draftVersion, mainTitle: piece.mainTitle }] : []
    })
    return {
      id: pkg.id,
      channelId: pkg.channelId,
      scriptId: pkg.scriptId,
      format: pkg.format,
      updatedAt: pkg.updatedAt,
      status: statusOf(pkg),
      idea: { id: idea.id, title: idea.title, hook: idea.hook, format: idea.format },
      script: {
        id: script.id,
        status: scriptStatus ?? 'sin_empezar',
        approvedDraftVersion: script.draftApprovedVersion,
        blocks: blocksOf(script),
      },
      pieces: Object.fromEntries(PACKAGE_KINDS.map((kind) => [kind, pieceOf(pieces[kind])])) as PackagePieces,
      approvals: {
        cover: pkg.coverApproved,
        texts: pkg.textsApproved,
        package: pkg.packageApproved,
        packageApprovedAt: pkg.packageApprovedAt,
        packageApprovedWarnings: pkg.packageApprovedWarnings,
      },
      warnings: packageWarnings({
        scriptApproved: scriptStatus === 'guion_aprobado',
        scriptApprovedDraft: scriptStatus === 'guion_aprobado' ? script.draftApprovedVersion : null,
        pendingInScript: script.draftApprovedPending ?? 0,
        pieces: made,
        currentMainTitle: mainTitleOf(pieces.titulos?.content),
        descriptionFixedText: pieces.descripcion?.content.fixedText ?? null,
        currentFixedText: texts.fixedText.current,
        sourcesCount: texts.sources.length,
      }),
      measured: measuredOf(idea),
      job: job && pkg.jobOp ? { id: job.id, op: pkg.jobOp, status: job.status, failure: job.failure } : null,
      studioDone: pkg.studioDone,
      studio: studioOf(pkg.channelId),
      texts,
      parentTitle: parentTitleOf(script),
      limits: limitsOf(),
    }
  }

  const read = (id: string): PackageView => {
    const { pkg, script, idea } = find(id)
    return view(pkg, script, idea)
  }

  // The last one touched first (FR-002): the main title once there is one, the working title before.
  const summaries = (channelId: string): PackageSummary[] => {
    channelOf(channelId)
    return packages.listByChannel(channelId).map((pkg) => {
      const script = scripts.get(pkg.scriptId)
      const idea = script ? ideas.get(script.ideaId) : null
      return {
        id: pkg.id,
        scriptId: pkg.scriptId,
        title: mainTitle(pkg) ?? idea?.title ?? '',
        format: pkg.format,
        status: statusOf(pkg),
        updatedAt: pkg.updatedAt,
      }
    })
  }

  // A script gets its package once approved; one that already has it keeps it whatever the script does (FR-001).
  const openForScript = (scriptId: string) => {
    const { script, idea } = scriptAndIdea(scriptId)
    channelOf(script.channelId)
    const existing = packages.getByScript(script.id)
    if (existing) return { view: view(existing, script, idea), created: false }
    if (deps.scriptStatus(idea.id) !== 'guion_aprobado') throw new ApiError({ code: 'sin_aprobar' })
    const pkg = packages.create({ channelId: script.channelId, scriptId: script.id, format: script.format })
    return { view: view(pkg, script, idea), created: true }
  }

  // The marks of the guided list: a help, so they make no version (R12, FR-017).
  // `base` is what the screen had: another tab marked something since, and nothing is written over it unsaid.
  const saveStudio = (id: string, done: readonly string[], base: readonly string[]): PackageView => {
    const { pkg } = find(id)
    const same = (one: readonly string[], other: readonly string[]) =>
      new Set(one).size === new Set(other).size && one.every((key) => other.includes(key))
    if (!same(base, pkg.studioDone)) throw new ApiError({ code: 'version_cambiada' })
    packages.setStudioDone(pkg.id, [...new Set(done)])
    return read(pkg.id)
  }

  // What is downloaded: the pieces as they are copied, with the main title and the chosen ideas (R15).
  const exportItem = (view: PackageView): PackageExportItem => {
    const titles = view.pieces.titulos?.content ?? null
    const textOf = (titleId: string | null) =>
      titleId === null ? null : (titles?.candidates.find((candidate) => candidate.id === titleId)?.text ?? null)
    const thumbnails = view.pieces.miniaturas?.content ?? null
    const main = textOf(titles?.main ?? null)
    return {
      title: main ?? view.idea.title,
      format: view.format,
      status: view.status,
      approvedAt: view.status === 'aprobado' ? view.approvals.packageApprovedAt : null,
      approvedWarnings: view.status === 'aprobado' ? view.approvals.packageApprovedWarnings : null,
      mainTitle: main,
      alternatives: (titles?.alternatives ?? []).flatMap((titleId) => textOf(titleId) ?? []),
      description: view.texts.assembled,
      thumbnails:
        view.format === 'largo' && thumbnails
          ? thumbnails.chosen.flatMap((conceptId) => {
              const concept = thumbnails.concepts.find((one) => one.id === conceptId)
              return concept
                ? [
                    {
                      scene: concept.scene,
                      bigText: concept.bigText,
                      emotion: concept.emotion,
                      composition: concept.composition,
                      colors: concept.colors,
                      title: textOf(concept.titleId),
                    },
                  ]
                : []
            })
          : [],
      cover: view.format === 'short' ? (view.pieces.portada_short?.content ?? null) : null,
      tags: view.pieces.etiquetas?.content.tags ?? [],
      comment: view.pieces.comentario?.content.text ?? '',
      studio: view.studio,
      studioDone: view.studioDone,
      parentTitle: view.parentTitle,
    }
  }

  const exportOne = (id: string) => {
    const packageView = read(id)
    const channel = channelOf(packageView.channelId)
    const item = exportItem(packageView)
    return {
      channel,
      item,
      fileName: (format: 'md' | 'json' | 'brief') =>
        format === 'brief' ? briefFileName(item.title, item.format) : packageFileName(item.title, format),
    }
  }

  // Every package of the channel that has a piece, the last one touched first (FR-023).
  const exportAll = (channelId: string) => {
    const channel = channelOf(channelId)
    // A package that cannot be read is left out, not the whole download, and the document says how many (VII).
    let skipped = 0
    const readable = (id: string) => {
      try {
        return [read(id)]
      } catch {
        skipped += 1
        return []
      }
    }
    const items = packages
      .listByChannel(channel.id)
      .flatMap((pkg) => readable(pkg.id))
      .filter((packageView) => packageView.status !== 'sin_empezar')
      .map(exportItem)
    return {
      channel,
      items,
      skipped,
      fileName: (format: 'md' | 'json') => packagesFileName(channel.displayName, format),
    }
  }

  /** The status of the package of a script, for the views of 004 and 005. */
  const scriptPackage = (scriptId: string) => {
    const pkg = packages.getByScript(scriptId)
    return pkg ? { id: pkg.id, status: statusOf(pkg) } : null
  }

  return {
    find,
    assertIdle,
    view,
    read,
    summaries,
    openForScript,
    scriptPackage,
    statusOf,
    settingsOf,
    saveSettings,
    saveStudio,
    reviewFigures,
    reviewSources,
    reviewOf,
    warningsCount,
    exportOne,
    exportAll,
    fixedTextOf,
    paceOf,
    approvedDraftOf,
    channelOf,
    scriptStatusOf: deps.scriptStatus,
  }
}

export type PackageService = ReturnType<typeof createPackageService>
