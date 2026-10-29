import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { findForbiddenTerms, forbiddenTerms } from '../../../packages/ui/test/forbidden-terms.ts'
import { es } from '../src/strings/es.ts'
import { failuresEs } from '../src/strings/failures.es.ts'

// The creator has to know which service each option uses (contracts/ui-screens.md), so the web may name the
// three brands of this feature. Model names stay forbidden (principle I).
const ALLOWED_BRANDS = ['Claude', 'Anthropic', 'Gemini']
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
    expect(findForbiddenTerms({ es, failuresEs }, webTerms)).toEqual([])
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
    expect(Object.values(strings)).toContain('Paso  de 8 ·')
    expect(Object.keys(strings).filter((key) => key.startsWith('MSG_')).length).toBeGreaterThanOrEqual(30)
  })

  it('no visible text of the installer uses a forbidden term', () => {
    expect(findForbiddenTerms(strings, webTerms)).toEqual([])
  })
})
