import { describe, expect, it } from 'vitest'
import { bundledScriptFiles, loadScriptKnowledge, SCRIPT_FILES, scriptKnowledgeFiles } from '../src/index.ts'

describe('script knowledge', () => {
  const files = bundledScriptFiles()

  it('ships every package', () => expect(Object.keys(files).sort()).toEqual([...SCRIPT_FILES].sort()))

  it('every package has a date and an https source', () => {
    const knowledge = loadScriptKnowledge(files)
    for (const entry of Object.values(knowledge)) {
      expect(entry.reviewedAt).toBe('2026-11-09')
      for (const source of entry.source) expect(source.url).toMatch(/^https:\/\//)
    }
  })

  it('the limits of the review are the ones of the plan, marked as an assumption', () => {
    const { review } = loadScriptKnowledge(files)
    expect(review.data).toMatchObject({
      maxSentenceWords: 25,
      hookMaxSeconds: { largo: 30, short: 5 },
      durationTolerance: 0.1,
      basis: { assumption: true },
    })
    expect(review.data.fillers.length).toBeGreaterThan(10)
  })

  it('every advice points to a source of its package or is marked as an assumption', () => {
    const { craft } = loadScriptKnowledge(files)
    const all = [
      ...craft.data.longVideo.structure,
      ...craft.data.longVideo.hook,
      ...craft.data.longVideo.retention,
      ...craft.data.short,
    ]
    for (const advice of all) {
      if ('source' in advice) expect(advice.source).toBeLessThan(craft.source.length)
      else expect(advice.assumption).toBe(true)
    }
  })

  it('lists the three packages with their age, for Ajustes', () => {
    expect(scriptKnowledgeFiles(loadScriptKnowledge(files)).map((entry) => entry.file)).toEqual([
      'craft.json',
      'review.json',
      'sources.json',
    ])
  })

  it('says what is not a reliable source', () => {
    const { sources } = loadScriptKnowledge(files)
    expect(sources.data.unreliableDomains).toContain('wikipedia.org')
    expect(sources.data.twoSourcesRule.assumption).toBe(true)
  })

  it('refuses a package that does not validate, naming it', () => {
    expect(() => loadScriptKnowledge({ ...files, 'review.json': {} })).toThrow(/review\.json/)
    const withoutCraft = Object.fromEntries(Object.entries(files).filter(([name]) => name !== 'craft.json'))
    expect(() => loadScriptKnowledge(withoutCraft)).toThrow(/craft\.json/)
  })
})
