import { createHash } from 'node:crypto'
import humanWriting from '../writing/human.md?raw'
import spokenWriting from '../writing/spoken.md?raw'
import lock from '../prompts/lock.json'

export const HUMAN_WRITING = humanWriting.trim()
export const SPOKEN_WRITING = spokenWriting.trim()

// What is said out loud is written for the audience, not for the creator (005, research.md R13).
const SPOKEN_USES: readonly string[] = ['guion', 'guion_short', 'bloque_guion']

const writingRulesOf = (use: string) => (SPOKEN_USES.includes(use) ? SPOKEN_WRITING : HUMAN_WRITING)

export interface Prompt {
  id: string
  version: number
  use: string
  sha256: string
  /** Prompt body as written in the file, without header. */
  body: string
  /** What is sent to the model: the body plus the writing rules for creative uses (FR-032). */
  text: string
}

export function promptHash(body: string): string {
  return createHash('sha256').update(body).digest('hex')
}

const HEADER = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/

/** Parses a versioned prompt file; throws if the header is missing or its hash does not match the body. */
export function parsePrompt(raw: string): Prompt {
  const match = HEADER.exec(raw.replace(/\r\n/g, '\n'))
  if (!match) throw new Error('El prompt no tiene cabecera (id, version, use, sha256)')
  const fields = Object.fromEntries(
    match[1]!.split('\n').map((line) => {
      const at = line.indexOf(':')
      return [line.slice(0, at).trim(), line.slice(at + 1).trim()]
    }),
  )
  const { id, use, sha256 } = fields
  const version = Number(fields['version'])
  if (!id || !use || !sha256 || !Number.isInteger(version) || version < 1) {
    throw new Error('La cabecera del prompt debe tener id, version, use y sha256')
  }
  const body = match[2]!.trim()
  if (promptHash(body) !== sha256) throw new Error(`El hash de ${id}@${version} no coincide con su texto`)
  const text = use === 'comprobacion' ? body : `${body}\n\n${writingRulesOf(use)}`
  return { id, version, use, sha256, body, text }
}

export const PROMPT_LOCK: Readonly<Record<string, string>> = lock

/** Problems found comparing prompts with prompts/lock.json; changing a text without bumping its version fails. */
export function checkPromptLock(prompts: readonly Prompt[], registered: Readonly<Record<string, string>>): string[] {
  return prompts.flatMap((p) => {
    const key = `${p.id}@${p.version}`
    const hash = registered[key]
    if (hash === undefined) return [`${key} no está registrado en prompts/lock.json`]
    if (hash !== p.sha256) return [`${key} cambió de texto sin subir la versión`]
    return []
  })
}

const files = import.meta.glob<string>('../prompts/*/v*.md', { eager: true, query: '?raw', import: 'default' })

/** Latest version of each prompt, keyed by use. */
export const PROMPTS: Readonly<Record<string, Prompt>> = Object.values(files)
  .map(parsePrompt)
  .reduce<Record<string, Prompt>>((acc, p) => {
    const current = acc[p.use]
    if (!current || current.version < p.version) acc[p.use] = p
    return acc
  }, {})

export function promptFor(use: string): Prompt {
  const prompt = PROMPTS[use]
  if (!prompt) throw new Error(`No hay prompt para el uso ${use}`)
  return prompt
}
