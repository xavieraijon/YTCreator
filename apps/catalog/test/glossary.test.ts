import { describe, expect, it } from 'vitest'
import { findForbiddenTerms } from '../../../packages/ui/test/forbidden-terms.ts'
import { sample } from '../src/strings/sample.es.ts'

describe('glossary (principle I)', () => {
  it('the sample page uses no forbidden term', () => {
    expect(findForbiddenTerms(sample)).toEqual([])
  })
})
