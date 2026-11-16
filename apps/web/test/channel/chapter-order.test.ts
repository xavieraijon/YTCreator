import type { SubtitleChapter } from '@ytcreator/core/api'
import { describe, expect, it } from 'vitest'
import { markedAtFirst, outOfOrder, unplaceable } from '../../src/screens/channel/subtitles/chapterOrder.ts'

// Which real minutes can be put (decision 60): the same rule as the server, said before asking.
const chapter = (
  id: string,
  estimated: number,
  real: number | null,
  extra: Partial<SubtitleChapter> = {},
): SubtitleChapter => ({
  chapterId: id,
  title: id,
  estimated,
  real,
  status: real === null ? 'no_encontrado' : 'encontrado',
  manual: false,
  fromAudio: false,
  ...extra,
})

describe('the minutes of the chapters (decision 60)', () => {
  it('the case of the novice audit: a chapter moved before one left as it is is never marked at first', () => {
    // Round 1: «El truco» heard at 0:02 while «Lo que necesitas» stayed at 0:13 → refused after confirming.
    const chapters = [
      chapter('empezamos', 0, 0),
      chapter('necesitas', 13, 0),
      chapter('truco', 24, 2),
      chapter('paso', 36, 3),
      chapter('resultado', 48, 3),
    ]
    expect([...outOfOrder(chapters)]).toEqual(['necesitas', 'resultado'])
    const marked = markedAtFirst(chapters, 10)
    const accept = chapters
      .filter((one) => marked.has(one.chapterId))
      .map((one) => ({ chapterId: one.chapterId, seconds: one.real! }))
    expect(unplaceable(chapters, accept, new Set(), 10).size).toBe(0)
    // Marking «El truco» by hand says it before asking.
    expect(unplaceable(chapters, [{ chapterId: 'truco', seconds: 2 }], new Set(), 10)).toEqual(
      new Set(['necesitas', 'truco']),
    )
  })

  it('a later video: every real minute is marked, and the estimated ones after move with them (R3 of 006)', () => {
    const chapters = [chapter('a', 0, 0), chapter('b', 60, 70), chapter('c', 120, 135), chapter('d', 180, 200)]
    expect(markedAtFirst(chapters, 10)).toEqual(new Set(['b', 'c', 'd']))
    // Only «b»: «c» and «d» move 10 s later with it, and stay in order.
    expect(unplaceable(chapters, [{ chapterId: 'b', seconds: 70 }], new Set(), 10).size).toBe(0)
  })

  it('an estimated chapter pushed too close to one written by hand is said, and not marked at first', () => {
    // «b» real at 70 pushes «c» (estimated 120) to 130, 5 s from «m», written by hand at 135.
    const chapters = [
      chapter('a', 0, 0),
      chapter('b', 60, 70),
      chapter('c', 120, null),
      chapter('m', 135, null, { manual: true }),
    ]
    expect(unplaceable(chapters, [{ chapterId: 'b', seconds: 70 }], new Set(), 10)).toEqual(new Set(['c', 'm']))
    expect(markedAtFirst(chapters, 10).size).toBe(0)
  })

  it('next to a real minute only the order counts; a minute written by the creator keeps the minimum', () => {
    const chapters = [chapter('a', 0, 0), chapter('b', 30, 33), chapter('c', 60, 35)]
    // Both real: 2 s apart is fine.
    expect(
      unplaceable(
        chapters,
        [
          { chapterId: 'b', seconds: 33 },
          { chapterId: 'c', seconds: 35 },
        ],
        new Set(),
        10,
      ).size,
    ).toBe(0)
    // «c» written by hand at 0:38 (not its real minute) is 5 s after «b» real: allowed, «b» is real.
    expect(
      unplaceable(
        chapters,
        [
          { chapterId: 'b', seconds: 33 },
          { chapterId: 'c', seconds: 38 },
        ],
        new Set(),
        10,
      ).size,
    ).toBe(0)
    // Without «b» real, «c» written at 0:35 is 5 s after «b» estimated at 0:30: too close.
    expect(unplaceable(chapters, [{ chapterId: 'c', seconds: 36 }], new Set(), 10)).toEqual(new Set(['b', 'c']))
  })

  it('a removed chapter is left out', () => {
    const chapters = [chapter('a', 0, 0), chapter('b', 30, null), chapter('c', 60, 20)]
    expect(unplaceable(chapters, [{ chapterId: 'c', seconds: 20 }], new Set(), 10)).toEqual(new Set(['b', 'c']))
    expect(unplaceable(chapters, [{ chapterId: 'c', seconds: 20 }], new Set(['b']), 10).size).toBe(0)
  })
})
