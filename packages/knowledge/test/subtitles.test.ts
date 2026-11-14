import { describe, expect, it } from 'vitest'
import {
  bundledSubtitlesFiles,
  loadSubtitlesKnowledge,
  SUBTITLE_FORMATS,
  SUBTITLES_FILES,
  subtitlesKnowledgeFiles,
} from '../src/index.ts'

describe('subtitles knowledge (007, research.md R7, R8, R10 and R14)', () => {
  const files = bundledSubtitlesFiles()

  it('ships every package', () => expect(Object.keys(files).sort()).toEqual([...SUBTITLES_FILES].sort()))

  it('every package has a date and an https source', () => {
    const knowledge = loadSubtitlesKnowledge(files)
    for (const entry of Object.values(knowledge)) {
      expect(entry.reviewedAt).toBe('2026-11-14')
      for (const source of entry.source) expect(source.url).toMatch(/^https:\/\//)
    }
    expect(subtitlesKnowledgeFiles(knowledge).map(({ file }) => file)).toEqual(
      SUBTITLES_FILES.map((file) => `subtitles/${file}`),
    )
  })

  it('the reading limits of a long video come from the Spanish guide, each with its source', () => {
    const { craft } = loadSubtitlesKnowledge(files)
    const long = craft.data.long
    expect(long).toMatchObject({
      maxLines: { value: 2 },
      maxCharsPerLine: { value: 42 },
      maxCharsPerSecond: { value: 17 },
      minSeconds: { value: 0.833 },
      maxSeconds: { value: 7 },
      minGapSeconds: { value: 0.083 },
    })
    for (const figure of Object.values(long)) expect('source' in figure).toBe(true)
  })

  it('a Short has one line of 32, as an assumption', () => {
    const { craft } = loadSubtitlesKnowledge(files)
    expect(craft.data.short.maxLines).toEqual({ value: 1, assumption: true })
    expect(craft.data.short.maxCharsPerLine).toEqual({ value: 32, assumption: true })
  })

  it('every source index points at a source of its file', () => {
    const { craft, youtube } = loadSubtitlesKnowledge(files)
    const indexes = (figures: object[]) =>
      figures.flatMap((figure) => ('source' in figure ? [figure.source as number] : []))
    for (const i of indexes([...Object.values(craft.data.long), ...Object.values(craft.data.short)]))
      expect(craft.source[i]).toBeDefined()
    for (const i of indexes(youtube.data.formats)) expect(youtube.source[i]).toBeDefined()
  })

  it('the threshold and the speed factors are assumptions, with one for each system and both models', () => {
    const { craft } = loadSubtitlesKnowledge(files)
    expect(craft.data.lowConfidence).toEqual({ value: 0.5, assumption: true })
    expect(craft.data.speed.assumption).toBe(true)
    for (const system of ['darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64'])
      expect(Object.keys(craft.data.speed.factors[system] ?? {}).sort()).toEqual([
        'ggml-large-v3-turbo-q5_0.bin',
        'ggml-small-q5_1.bin',
      ])
  })

  it('YouTube takes the three formats, SRT by default', () => {
    const { youtube } = loadSubtitlesKnowledge(files)
    expect(youtube.data.formats.map((f) => f.id)).toEqual([...SUBTITLE_FORMATS])
    expect(youtube.data.byDefault).toBe('srt')
  })

  it('refuses a broken file naming it, so the server does not start', () => {
    expect(() => loadSubtitlesKnowledge({ ...files, 'craft.json': { version: 1 } })).toThrow(/subtitles\/craft.json/)
    const withoutYoutube = Object.fromEntries(Object.entries(files).filter(([file]) => file !== 'youtube.json'))
    expect(() => loadSubtitlesKnowledge(withoutYoutube)).toThrow(/Falta.*youtube.json/)
  })
})
