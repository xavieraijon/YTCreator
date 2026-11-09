import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { findForbiddenTerms, forbiddenTerms } from '../../../packages/ui/test/forbidden-terms.ts'
import { channelEs } from '../src/strings/channel.es.ts'
import { es } from '../src/strings/es.ts'
import { failuresEs } from '../src/strings/failures.es.ts'
import { ideasEs } from '../src/strings/ideas.es.ts'
import { scriptEs } from '../src/strings/script.es.ts'
import { youtubeFailureActionsEs, youtubeFailuresEs } from '../src/strings/youtube-failures.es.ts'

// The creator has to know which service each option uses (contracts/ui-screens.md), so the web may name the
// three brands of this feature. Model names stay forbidden (principle I).
const ALLOWED_BRANDS = ['Claude', 'Anthropic']
const MODEL_NAMES = ['Sonnet', 'Opus', 'Haiku', 'Flash']
const webTerms = [...forbiddenTerms.filter((term) => !ALLOWED_BRANDS.includes(term)), ...MODEL_NAMES]

// Visible texts of the installer (T073): every `MSG_*` variable plus the literal `echo`/`printf` lines, with the
// shell expansions removed. «Claude Code» is what step 5 installs, so the same brands are allowed.
function installerStrings(): Record<string, string> {
  const script = readFileSync(new URL('../../../installer/install.sh', import.meta.url), 'utf8')
  const strings: Record<string, string> = {}
  for (const [, name, value] of script.matchAll(/^(MSG_[A-Z0-9_]+)="([^"]*)"$/gm)) strings[name ?? ''] = value ?? ''
  for (const [index, [, value]] of [
    ...script.matchAll(/(?:echo|printf) "([^"$]*(?:\$\{[^}]*\}[^"$]*)*)"/g),
  ].entries()) {
    const text = (value ?? '').replace(/\$\{[^}]*\}/g, '').trim()
    if (text !== '' && text !== '%s') strings[`literal.${index}`] = text
  }
  return strings
}

describe('glossary of the web (FR-032, principle I)', () => {
  it('no text of apps/web/src/strings uses a forbidden term', () => {
    expect(
      findForbiddenTerms(
        { es, failuresEs, channelEs, ideasEs, scriptEs, youtubeFailuresEs, youtubeFailureActionsEs },
        webTerms,
      ),
    ).toEqual([])
  })

  it.each(['channel', 'ideas'])(
    'nor the texts of a download written by the server (packages/core/src/%s/export.ts)',
    (folder) => {
      const source = readFileSync(new URL(`../../../packages/core/src/${folder}/export.ts`, import.meta.url), 'utf8')
        // Comments go first: an apostrophe in one would pair with the next quote.
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
      const texts: Record<string, string> = {}
      // The literals, read left to right; those with a space are texts the creator reads, the rest keys and code.
      const literals = [...source.matchAll(/'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g)].map(([literal]) =>
        literal.slice(1, -1),
      )
      literals
        .filter((literal) => /\s/.test(literal))
        .forEach((literal, index) => {
          texts[`export.${index}`] = literal.replace(/\$\{[^}]*\}/g, '')
        })
      expect(Object.keys(texts).length).toBeGreaterThan(folder === 'channel' ? 20 : 10)
      expect(findForbiddenTerms(texts, webTerms)).toEqual([])
    },
  )

  it('no source of the knowledge files uses one either: they are shown under the figures', () => {
    const labels: Record<string, string> = {}
    for (const folder of ['market', 'script']) {
      const dir = new URL(`../../../packages/knowledge/${folder}/`, import.meta.url)
      for (const file of readdirSync(dir).filter((name) => name.endsWith('.json'))) {
        const { source } = JSON.parse(readFileSync(new URL(file, dir), 'utf8')) as { source: { label: string }[] }
        source.forEach(({ label }, index) => {
          labels[`${folder}/${file}.${index}`] = label
        })
      }
    }
    expect(Object.keys(labels).length).toBeGreaterThan(0)
    expect(findForbiddenTerms(labels, webTerms)).toEqual([])
  })

  it('forbids the YouTube jargon of 003 too', () => {
    const texts = { a: 'Tu RPM', b: 'el YPP', c: 'sube tu CTR', d: 'elige tu handle', e: 'instala yt-dlp' }
    expect(findForbiddenTerms(texts, webTerms)).toEqual([
      { key: 'a', term: 'RPM' },
      { key: 'b', term: 'YPP' },
      { key: 'c', term: 'CTR' },
      { key: 'd', term: 'handle' },
      { key: 'e', term: 'yt-dlp' },
    ])
  })

  it('still forbids jargon and model names', () => {
    expect(findForbiddenTerms({ a: 'Pega tu token', b: 'Usa la API', c: 'con Sonnet' }, webTerms)).toEqual([
      { key: 'a', term: 'token' },
      { key: 'b', term: 'API' },
      { key: 'c', term: 'Sonnet' },
    ])
  })
})

describe('glossary of the installer (FR-032, principle I)', () => {
  const strings = installerStrings()

  it('finds the visible texts of installer/install.sh', () => {
    expect(strings.MSG_STEP1).toBe('Comprobando tu ordenador')
    expect(Object.values(strings)).toContain('Paso  de 9 ·')
    expect(Object.keys(strings).filter((key) => key.startsWith('MSG_')).length).toBeGreaterThanOrEqual(30)
  })

  it('no visible text of the installer uses a forbidden term', () => {
    expect(findForbiddenTerms(strings, webTerms)).toEqual([])
  })
})
