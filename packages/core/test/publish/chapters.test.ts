import { describe, expect, it } from 'vitest'
import {
  chapterTimes,
  chaptersInOrder,
  formatChapterTime,
  parseChapterTime,
  proposeChapters,
} from '../../src/publish/chapters.ts'
import { chaptersContentSchema, type Chapter } from '../../src/publish/model.ts'
import { reviewPackage } from '../../src/publish/review.ts'
import { durationSeconds } from '../../src/script/duration.ts'

// At 150 words a minute, 25 words last 10 seconds.
const WPM = 150
const words = (count: number) => Array.from({ length: count }, () => 'pan').join(' ')
const block = (id: string, wordCount: number) => ({ id, text: words(wordCount) })
const chapter = (id: string, blockIds: string[], extra: Partial<Chapter> = {}): Chapter => ({
  id,
  title: `Capítulo ${id}`,
  blockIds,
  startSeconds: null,
  manual: false,
  ...extra,
})

describe('chapterTimes (research.md R3)', () => {
  const blocks = [block('a', 50), block('b', 100), block('c', 25), block('d', 75)]

  it('adds up how long the blocks before each chapter last at the channel pace; the first is always 0', () => {
    const times = chapterTimes([chapter('1', ['a']), chapter('2', ['b', 'c']), chapter('3', ['d'])], blocks, WPM)
    const a = durationSeconds(blocks[0]!.text, WPM)
    const bc = durationSeconds(blocks[1]!.text, WPM) + durationSeconds(blocks[2]!.text, WPM)
    expect(times).toEqual([0, a, a + bc])
  })

  it('keeps a minute written by the creator and does not work it out again', () => {
    const times = chapterTimes(
      [chapter('1', ['a']), chapter('2', ['b'], { startSeconds: 95, manual: true }), chapter('3', ['c', 'd'])],
      blocks,
      WPM,
    )
    expect(times[1]).toBe(95)
    // The ones after it move by as much as the written minute moved its own.
    expect(times[2]).toBe(95 + durationSeconds(blocks[1]!.text, WPM))
  })

  it('chaptersInOrder: each one at least the minimum after the one before', () => {
    expect(chaptersInOrder([0, 10, 25], 10)).toBe(true)
    expect(chaptersInOrder([0, 9], 10)).toBe(false)
    expect(chaptersInOrder([0, 300, 70], 10)).toBe(false)
    expect(chaptersInOrder([0], 10)).toBe(true)
  })

  it('starts the first one at 0 even if a minute was written for it', () => {
    expect(chapterTimes([chapter('1', ['a'], { startSeconds: 12, manual: true })], blocks, WPM)).toEqual([0])
  })

  it('a chapter whose blocks are not in the script starts where the one before ends', () => {
    expect(chapterTimes([chapter('1', ['a']), chapter('2', ['gone'])], blocks, WPM)).toEqual([
      0,
      durationSeconds(blocks[0]!.text, WPM),
    ])
  })
})

describe('the real minute of a chapter, from the audio (007, R13)', () => {
  const blocks = [block('a', 50), block('b', 100), block('c', 25), block('d', 75)]

  it('chapterTimes keeps it like a written one, and moves the estimated ones after it', () => {
    const times = chapterTimes(
      [chapter('1', ['a']), chapter('2', ['b'], { startSeconds: 40, fromAudio: true }), chapter('3', ['c', 'd'])],
      blocks,
      WPM,
    )
    expect(times[1]).toBe(40)
    expect(times[2]).toBe(40 + durationSeconds(blocks[1]!.text, WPM))
  })

  it('a version saved before 007, without the field, still reads; one from the audio needs its minute', () => {
    const old = { chapters: [{ id: '1', title: 'Uno', blockIds: ['a'], startSeconds: null, manual: false }] }
    expect(chaptersContentSchema.safeParse(old).success).toBe(true)
    const real = { chapters: [{ ...old.chapters[0]!, startSeconds: 0, fromAudio: true }] }
    expect(chaptersContentSchema.safeParse(real).success).toBe(true)
    const noMinute = { chapters: [{ ...old.chapters[0]!, fromAudio: true }] }
    expect(chaptersContentSchema.safeParse(noMinute).success).toBe(false)
  })

  it('the review of 006 warns of a real chapter under YouTube’s minimum', () => {
    const chapters = [
      chapter('1', ['a']),
      chapter('2', ['b'], { startSeconds: 40, fromAudio: true }),
      chapter('3', ['c'], { startSeconds: 45, fromAudio: true }),
      chapter('4', ['d'], { startSeconds: 90, fromAudio: true }),
    ]
    const times = chapterTimes(chapters, blocks, WPM)
    const notices = reviewPackage(
      {
        format: 'largo',
        pieces: { capitulos: { chapters } },
        assembled: null,
        chapters: chapters.map((one, index) => ({ id: one.id, startSeconds: times[index]! })),
        scriptSeconds: 200,
      },
      {
        titleMaxChars: 100,
        mobileTitleChars: 70,
        descriptionMaxChars: 5000,
        tagsMaxTotalChars: 500,
        chapterMinCount: 3,
        chapterMinSeconds: 10,
        hashtagsShown: 3,
      },
    )
    expect(notices.filter((one) => one.rule === 'capitulo_corto')).toEqual([
      expect.objectContaining({ chapterId: '2', value: 5 }),
    ])
  })
})

describe('formatChapterTime', () => {
  it('m:ss under an hour and h:mm:ss from an hour', () => {
    expect(formatChapterTime(0)).toBe('0:00')
    expect(formatChapterTime(65)).toBe('1:05')
    expect(formatChapterTime(600)).toBe('10:00')
    expect(formatChapterTime(3600)).toBe('1:00:00')
    expect(formatChapterTime(3725)).toBe('1:02:05')
  })
})

describe('parseChapterTime', () => {
  it('reads what formatChapterTime writes, and nothing else', () => {
    for (const seconds of [0, 65, 600, 3600, 3725]) expect(parseChapterTime(formatChapterTime(seconds))).toBe(seconds)
    expect(parseChapterTime(' 2:05 ')).toBe(125)
    expect(parseChapterTime('12:00')).toBe(720)
    for (const wrong of ['', '5', '1:5', '1:60', 'a:bc', '1:02:60', '-1:00', '1,05'])
      expect(parseChapterTime(wrong)).toBeNull()
  })
})

describe('proposeChapters (research.md R3, SC-003)', () => {
  const MIN = 10

  const valid = (
    chapters: readonly { blockIds: readonly string[] }[],
    blockIds: string[],
    blocks: { id: string; text: string }[],
  ) => {
    expect(chapters.flatMap((one) => one.blockIds)).toEqual(blockIds)
    const times = chapterTimes(
      chapters.map((one, index) => chapter(String(index), [...one.blockIds])),
      blocks,
      WPM,
    )
    expect(times[0]).toBe(0)
    const total = blocks.reduce((sum, one) => sum + durationSeconds(one.text, WPM), 0)
    times.forEach((start, index) => {
      const end = times[index + 1] ?? total
      if (chapters.length > 1) expect(end - start).toBeGreaterThanOrEqual(MIN)
    })
  }

  it('joins a chapter under the minimum with the next one, keeping its name', () => {
    const blocks = [block('a', 10), block('b', 100), block('c', 100)]
    const proposed = proposeChapters(
      [
        { title: 'Hola', blockIds: ['a'] },
        { title: 'Primera parte', blockIds: ['b'] },
        { title: 'Segunda parte', blockIds: ['c'] },
      ],
      blocks,
      WPM,
      MIN,
    )
    expect(proposed).toEqual([
      { title: 'Hola', blockIds: ['a', 'b'] },
      { title: 'Segunda parte', blockIds: ['c'] },
    ])
  })

  it('joins a short last chapter with the one before', () => {
    const blocks = [block('a', 100), block('b', 100), block('c', 5)]
    const proposed = proposeChapters(
      [
        { title: 'Uno', blockIds: ['a'] },
        { title: 'Dos', blockIds: ['b'] },
        { title: 'Adiós', blockIds: ['c'] },
      ],
      blocks,
      WPM,
      MIN,
    )
    expect(proposed).toEqual([
      { title: 'Uno', blockIds: ['a'] },
      { title: 'Dos', blockIds: ['b', 'c'] },
    ])
  })

  it('a script too short for two chapters gives one', () => {
    const blocks = [block('a', 5), block('b', 5)]
    const proposed = proposeChapters(
      [
        { title: 'Uno', blockIds: ['a'] },
        { title: 'Dos', blockIds: ['b'] },
      ],
      blocks,
      WPM,
      MIN,
    )
    expect(proposed).toEqual([{ title: 'Uno', blockIds: ['a', 'b'] }])
  })

  // Recorded cases: whatever the AI groups, every chapter it leaves is one YouTube shows (SC-003).
  const recorded: { name: string; words: number[]; groups: number[][] }[] = [
    { name: 'escaleta de cinco bloques', words: [40, 220, 180, 260, 60], groups: [[0], [1], [2], [3], [4]] },
    { name: 'gancho y cierre muy cortos', words: [8, 300, 300, 6], groups: [[0], [1], [2], [3]] },
    {
      name: 'muchos bloques cortos',
      words: [20, 20, 20, 20, 20, 20, 20, 20],
      groups: [[0, 1], [2], [3], [4, 5], [6], [7]],
    },
    { name: 'un solo capítulo', words: [200, 200, 200], groups: [[0, 1, 2]] },
    { name: 'todo corto', words: [3, 3, 3, 3], groups: [[0], [1], [2], [3]] },
    { name: 'el último corto tras otro corto', words: [300, 10, 10], groups: [[0], [1], [2]] },
  ]

  for (const sample of recorded) {
    it(`leaves only valid chapters: ${sample.name}`, () => {
      const blocks = sample.words.map((count, index) => block(`b${index}`, count))
      const ids = blocks.map((one) => one.id)
      const proposed = proposeChapters(
        sample.groups.map((group, index) => ({ title: `C${index}`, blockIds: group.map((at) => ids[at]!) })),
        blocks,
        WPM,
        MIN,
      )
      valid(proposed, ids, blocks)
    })
  }
})
