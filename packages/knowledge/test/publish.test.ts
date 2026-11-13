import { describe, expect, it } from 'vitest'
import { bundledPublishFiles, loadPublishKnowledge, PUBLISH_FILES, publishKnowledgeFiles } from '../src/index.ts'

describe('publish knowledge (006, research.md R11)', () => {
  const files = bundledPublishFiles()

  it('ships every package', () => expect(Object.keys(files).sort()).toEqual([...PUBLISH_FILES].sort()))

  it('every package has a date and an https source', () => {
    const knowledge = loadPublishKnowledge(files)
    for (const entry of Object.values(knowledge)) {
      expect(entry.reviewedAt).toBe('2026-11-13')
      for (const source of entry.source) expect(source.url).toMatch(/^https:\/\//)
    }
    expect(publishKnowledgeFiles(knowledge).map(({ file }) => file)).toEqual(
      PUBLISH_FILES.map((file) => `publish/${file}`),
    )
  })

  it('the limits of YouTube are the ones of the plan, each with its source', () => {
    const { youtube } = loadPublishKnowledge(files)
    expect(youtube.data).toMatchObject({
      titleMaxChars: { value: 100 },
      descriptionMaxChars: { value: 5000 },
      tagsMaxTotalChars: { value: 500 },
      chapters: { minCount: { value: 3 }, minSeconds: { value: 10 } },
      hashtags: { shownAboveTitle: { value: 3 }, ignoredAbove: { value: 60 } },
      testAndCompare: { maxTitles: { value: 3 }, maxThumbnails: { value: 3 } },
    })
    const figures = [
      youtube.data.titleMaxChars,
      youtube.data.descriptionMaxChars,
      youtube.data.tagsMaxTotalChars,
      youtube.data.chapters.minCount,
      youtube.data.chapters.minSeconds,
      youtube.data.hashtags.shownAboveTitle,
      youtube.data.hashtags.ignoredAbove,
      youtube.data.testAndCompare.maxTitles,
      youtube.data.testAndCompare.maxThumbnails,
    ]
    for (const figure of figures) {
      expect('source' in figure, JSON.stringify(figure)).toBe(true)
      if ('source' in figure) expect(figure.source).toBeLessThan(youtube.source.length)
    }
  })

  it('every advice points to a source of its package or is marked as an assumption', () => {
    const { craft } = loadPublishKnowledge(files)
    const all = [...craft.data.titles, ...craft.data.thumbnails, ...craft.data.description, ...craft.data.comment]
    for (const advice of all) {
      if ('source' in advice) expect(advice.source).toBeLessThan(craft.source.length)
      else expect(advice.assumption).toBe(true)
    }
    expect(craft.data.mobileTitleChars).toEqual({ value: 70, assumption: true })
  })

  it('the guided list of YouTube Studio: a question for synthetic content and the suggested category as an assumption', () => {
    const { studio } = loadPublishKnowledge(files)
    expect(studio.data.synthetic.question).toMatch(/\?$/)
    expect(studio.data.synthetic.source).toBeLessThan(studio.source.length)
    expect(studio.data.category.suggested).toEqual({ value: 'Educación', assumption: true })
    expect(studio.data.category.list).toContain('Educación')
  })

  it('a broken package names its file', () => {
    expect(() => loadPublishKnowledge({ ...files, 'youtube.json': { version: 1 } })).toThrow(/youtube\.json/)
    const withoutStudio = Object.fromEntries(Object.entries(files).filter(([name]) => name !== 'studio.json'))
    expect(() => loadPublishKnowledge(withoutStudio)).toThrow(/studio\.json/)
  })
})
