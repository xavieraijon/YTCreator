import { describe, expect, it } from 'vitest'
import {
  HUMAN_WRITING,
  PROMPT_LOCK,
  PROMPTS,
  SPOKEN_WRITING,
  checkPromptLock,
  parsePrompt,
  promptHash,
} from '../src/index.ts'

const SPOKEN = ['guion', 'guion_short', 'bloque_guion']

describe('versioned prompts', () => {
  it('loads at least the comprobacion prompt', () => {
    expect(PROMPTS['comprobacion']?.text).toBe('Responde solo con la palabra: listo')
  })

  it('every prompt has a header with id, version, use and a hash that matches its body', () => {
    for (const prompt of Object.values(PROMPTS)) {
      expect(prompt.version).toBeGreaterThan(0)
      expect(prompt.sha256).toBe(promptHash(prompt.body))
    }
  })

  it('every prompt is registered in lock.json with its hash', () => {
    expect(checkPromptLock(Object.values(PROMPTS), PROMPT_LOCK)).toEqual([])
  })

  it('changing the text without bumping the version fails', () => {
    const original = PROMPTS['comprobacion']!
    const body = `${original.body} y nada más`
    const raw = `---\nid: comprobacion\nversion: ${original.version}\nuse: comprobacion\nsha256: ${promptHash(body)}\n---\n${body}\n`
    const edited = parsePrompt(raw)
    expect(checkPromptLock([edited], PROMPT_LOCK)).toEqual([expect.stringContaining('comprobacion@1')])
  })

  it('rejects a header whose hash does not match the body', () => {
    const raw = '---\nid: x\nversion: 1\nuse: comprobacion\nsha256: abc\n---\nHola\n'
    expect(() => parsePrompt(raw)).toThrow(/hash/)
  })

  it('rejects a prompt without header', () => {
    expect(() => parsePrompt('Hola')).toThrow(/cabecera|header/)
  })

  it('appends the human writing rules to creative prompts only', () => {
    expect(HUMAN_WRITING.length).toBeGreaterThan(50)
    // The check, and the review of the subtitles (007), which only fixes how what was said is written.
    const plain = ['comprobacion', 'revision_subtitulos']
    for (const use of plain) expect(PROMPTS[use]!.text).not.toContain(HUMAN_WRITING)
    for (const prompt of Object.values(PROMPTS)) {
      if (!plain.includes(prompt.use) && !SPOKEN.includes(prompt.use)) expect(prompt.text).toContain(HUMAN_WRITING)
    }
  })

  it('what is said out loud gets the spoken rules instead of the ones for the creator (005)', () => {
    for (const use of SPOKEN) {
      const body = 'Escribe.'
      const raw = `---\nid: ${use}\nversion: 1\nuse: ${use}\nsha256: ${promptHash(body)}\n---\n${body}\n`
      const prompt = parsePrompt(raw)
      expect(prompt.text).toContain(SPOKEN_WRITING)
      expect(prompt.text).not.toContain(HUMAN_WRITING)
    }
    const other = parsePrompt(
      `---\nid: escaleta\nversion: 1\nuse: escaleta\nsha256: ${promptHash('Haz.')}\n---\nHaz.\n`,
    )
    expect(other.text).toContain(HUMAN_WRITING)
  })
})
