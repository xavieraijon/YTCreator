import {
  assembleDescription,
  channelProfileSchema,
  chapterTimes,
  DEFAULT_SCRIPT_SETTINGS,
  defaultFixedText,
  descriptionSources,
  durationSeconds,
  formatChapterTime,
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

  // A profile that does not read has no @ to build the link with: the default is then empty, as without one.
  const handleOf = (channelId: string) => {
    const parsed = channelProfileSchema.safeParse(deps.profiles.getCurrent(channelId)?.profile)
    // Only a name the creator chose: a provisional one may not be theirs on YouTube.
    return parsed.success && parsed.data.name.status === 'elegido' ? parsed.data.name.handle : null
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
      assembled: description ? assembleDescription(description, timed, sources) : null,
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
    return {
      titleMaxChars: title.value,
      mobileTitleChars: craft.data.mobileTitleChars.value,
      descriptionMaxChars: description.value,
      youtube: { label: source.label, date: youtube.reviewedAt },
    }
  }

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
    fixedTextOf,
    paceOf,
    approvedDraftOf,
    channelOf,
    scriptStatusOf: deps.scriptStatus,
  }
}

export type PackageService = ReturnType<typeof createPackageService>
