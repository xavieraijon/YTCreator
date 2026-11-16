import { blockStarts } from '@ytcreator/core'
import type { ChaptersFromAudioBody, PackageView, SubtitleChapter } from '@ytcreator/core/api'
import type { SubtitleVersionsRepo } from '../db/repos/subtitle-versions.ts'
import { ApiError } from '../http/errors.ts'
import type { PackageWork } from './package-work.ts'
import type { PackageService } from './packages.ts'
import type { SubtitlesService } from './subtitles.ts'

export interface SubtitlesChaptersDeps {
  subtitles: SubtitlesService
  versions: SubtitleVersionsRepo
  packages: PackageService
  work: PackageWork
}

// The real minutes of the chapters (US3, research.md R13): worked out when asked for, never kept; what the creator
// accepts goes into the package of 006 as a new version of its chapters.
export function createSubtitlesChapters(deps: SubtitlesChaptersDeps) {
  const proposal = (scriptId: string): SubtitleChapter[] => {
    const { script, track } = deps.subtitles.find(scriptId)
    const pkg = deps.packages.scriptPackage(scriptId)
    // Only a long video has chapters.
    if (!pkg || script.format !== 'largo') throw new ApiError({ code: 'no_encontrado' })
    const latest = track ? deps.versions.latest(track.id) : null
    if (!latest) throw new ApiError({ code: 'no_encontrado' })
    const view: PackageView = deps.packages.read(pkg.id)
    const blocks = deps.packages.approvedDraftOf(script)?.content.blocks ?? []
    const starts = new Map(blockStarts(latest.content.words, blocks).map((one) => [one.blockId, one.seconds]))
    return view.texts.chapters.map((chapter, index) => {
      const first = chapter.blockIds[0]
      // The first chapter is always at 0:00, as YouTube asks; a minute is whole seconds, never after the first word.
      const found = index === 0 ? 0 : first === undefined ? null : (starts.get(first) ?? null)
      const real = found === null ? null : Math.floor(found)
      return {
        chapterId: chapter.id,
        title: chapter.title,
        estimated: chapter.startSeconds,
        real,
        status: real === null ? 'no_encontrado' : 'encontrado',
        manual: chapter.manual,
        fromAudio: chapter.fromAudio,
      }
    })
  }

  /** A minute equal to the one proposed is the real one; any other was written by the creator. */
  const accept = (packageId: string, { baseVersion, accept: accepted, remove }: ChaptersFromAudioBody): PackageView => {
    const { script } = deps.packages.find(packageId)
    const real = new Map(proposal(script.id).map((one) => [one.chapterId, one.real]))
    // A minute past the end of the audio is not in the video.
    const audioSeconds = deps.versions.latest(deps.subtitles.find(script.id).track!.id)!.content.audioSeconds
    if (accepted.some(({ seconds }) => seconds > audioSeconds))
      throw new ApiError({ code: 'validacion', fields: { accept: 'no_valido' } })
    return deps.work.saveChapterMinutes(
      packageId,
      baseVersion,
      accepted.map(({ chapterId, seconds }) => ({ chapterId, seconds, fromAudio: real.get(chapterId) === seconds })),
      remove,
    )
  }

  return { proposal, accept }
}

export type SubtitlesChapters = ReturnType<typeof createSubtitlesChapters>
