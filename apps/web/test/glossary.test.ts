import { describe, expect, it } from 'vitest'
import { findForbiddenTerms, forbiddenTerms } from '../../../packages/ui/test/forbidden-terms.ts'
import { es } from '../src/strings/es.ts'
import { failuresEs } from '../src/strings/failures.es.ts'

// The creator has to know which service each option uses (contracts/ui-screens.md), so the web may name the
// three brands of this feature. Model names stay forbidden (principle I).
const ALLOWED_BRANDS = ['Claude', 'Anthropic', 'Gemini']
const MODEL_NAMES = ['Sonnet', 'Opus', 'Haiku', 'Flash']
const webTerms = [...forbiddenTerms.filter((term) => !ALLOWED_BRANDS.includes(term)), ...MODEL_NAMES]

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
