import { describe, expect, it } from 'vitest'
import { HUMAN_WRITING, PROMPT_LOCK, PROMPTS, checkPromptLock, parsePrompt, promptHash } from '../src/index.ts'

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
    expect(PROMPTS['comprobacion']!.text).not.toContain(HUMAN_WRITING)
    for (const prompt of Object.values(PROMPTS)) {
      if (prompt.use !== 'comprobacion') expect(prompt.text).toContain(HUMAN_WRITING)
    }
  })
})
