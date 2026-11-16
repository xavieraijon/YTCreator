import { durationSeconds } from '../script/duration.ts'
import type { Chapter } from './model.ts'

// The chapters of the description: the AI names them and groups the blocks; the minutes are worked out here, so every
// chapter YouTube gets is a valid one (research.md R3, SC-003).

export interface TimedBlock {
  readonly id: string
  readonly text: string
}

export interface ProposedChapter {
  readonly title: string
  readonly blockIds: readonly string[]
}

const secondsOf = (blocks: readonly TimedBlock[], wordsPerMinute: number) =>
  new Map(blocks.map((block) => [block.id, durationSeconds(block.text, wordsPerMinute)]))

const lengthOf = (blockIds: readonly string[], seconds: ReadonlyMap<string, number>) =>
  blockIds.reduce((sum, id) => sum + (seconds.get(id) ?? 0), 0)

/** A minute that is not worked out again: written by the creator, or the real one from the audio (007). */
export const fixedMinute = (
  chapter: Pick<Chapter, 'startSeconds' | 'manual' | 'fromAudio'>,
): chapter is Pick<Chapter, 'manual' | 'fromAudio'> & { startSeconds: number } =>
  (chapter.manual || chapter.fromAudio === true) && chapter.startSeconds !== null

/**
 * When each chapter starts, in seconds: the one the creator wrote (`manual`), the real one from the audio (`fromAudio`),
 * or what the blocks before it last at the
 * channel's pace. The first one always starts at 0, as YouTube asks.
 */
export function chapterTimes(
  chapters: readonly Pick<Chapter, 'blockIds' | 'startSeconds' | 'manual' | 'fromAudio'>[],
  blocks: readonly TimedBlock[],
  wordsPerMinute: number,
): number[] {
  const seconds = secondsOf(blocks, wordsPerMinute)
  const startOf = new Map<string, number>()
  let elapsed = 0
  for (const block of blocks) {
    startOf.set(block.id, elapsed)
    elapsed += seconds.get(block.id) ?? 0
  }
  // Where the chapter before ends, for one whose blocks are no longer in the script.
  let cursor = 0
  // A minute the creator writes moves the estimated ones after it by as much: the video is longer or shorter there.
  let shift = 0
  return chapters.map((chapter, index) => {
    const first = chapter.blockIds.find((id) => startOf.has(id))
    const worked = first === undefined ? cursor : startOf.get(first)!
    cursor = worked + lengthOf(chapter.blockIds, seconds)
    if (index === 0) return 0
    if (fixedMinute(chapter)) {
      shift = chapter.startSeconds - worked
      return chapter.startSeconds
    }
    return worked + shift
  })
}

/** Whether each chapter starts at least `minSeconds` after the one before, as YouTube needs to show them. */
export const chaptersInOrder = (times: readonly number[], minSeconds: number) =>
  times.every((start, index) => index === 0 || start - times[index - 1]! >= minSeconds)

/** «m:ss», and «h:mm:ss» from an hour, as YouTube reads them in a description. */
export function formatChapterTime(totalSeconds: number): string {
  const whole = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const seconds = String(whole % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}

/** The minute the creator writes, as YouTube shows it (`1:05`, `1:02:05`); `null` if it is not one. */
export function parseChapterTime(text: string): number | null {
  const match = /^(?:(\d+):([0-5]\d)|(\d+)):([0-5]\d)$/.exec(text.trim())
  if (!match) return null
  const [, hours, minutesInHour, minutes, seconds] = match
  return hours !== undefined
    ? Number(hours) * 3600 + Number(minutesInHour) * 60 + Number(seconds)
    : Number(minutes) * 60 + Number(seconds)
}

/**
 * The chapters the AI groups, so that none is shorter than YouTube's minimum: a short one joins the next one and keeps
 * its name (it is where the joined chapter starts); a short last one joins the one before. A script too short for two
 * chapters gives one.
 */
export function proposeChapters(
  chapters: readonly ProposedChapter[],
  blocks: readonly TimedBlock[],
  wordsPerMinute: number,
  minSeconds: number,
): ProposedChapter[] {
  const seconds = secondsOf(blocks, wordsPerMinute)
  const out = chapters.map((chapter) => ({ title: chapter.title, blockIds: [...chapter.blockIds] }))
  let index = 0
  while (out.length > 1 && index < out.length) {
    const current = out[index]!
    if (lengthOf(current.blockIds, seconds) >= minSeconds) {
      index += 1
      continue
    }
    if (index < out.length - 1) {
      const next = out[index + 1]!
      out.splice(index, 2, { title: current.title, blockIds: [...current.blockIds, ...next.blockIds] })
    } else {
      const before = out[index - 1]!
      out.splice(index - 1, 2, { title: before.title, blockIds: [...before.blockIds, ...current.blockIds] })
      index -= 1
    }
  }
  return out
}
