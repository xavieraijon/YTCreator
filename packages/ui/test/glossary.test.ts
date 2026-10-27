import { describe, expect, it } from 'vitest'
import { es } from '../src/strings/es.ts'
import { findForbiddenTerms } from './forbidden-terms.ts'

describe('glossary (principle I)', () => {
  it('the default texts of @ytcreator/ui use no forbidden term', () => {
    expect(findForbiddenTerms(es)).toEqual([])
  })

  it('detects whole words regardless of case', () => {
    expect(findForbiddenTerms({ a: 'Revisa tu Prompt', b: 'Promptuario', c: 'falta el token.' })).toEqual([
      { key: 'a', term: 'prompt' },
      { key: 'c', term: 'token' },
    ])
  })
})
