import { describe, expect, it } from 'vitest'
import { domainOf, factLabel, seenSources, type FactLabelInput } from '../../src/script/facts.ts'

const unreliableDomains = ['wikipedia.org', 'reddit.com', 'blogspot.com']

const source = (url: string, link: 'abre' | 'no_abre' | 'sin_comprobar' | null = 'abre') => ({ url, link })

const label = (fact: Partial<FactLabelInput>) =>
  factLabel({ proposed: 'comprobado', origin: 'ia', sources: [], ...fact }, unreliableDomains)

describe('factLabel', () => {
  it('leaves unconfirmed what the sources disagree about, however many there are', () => {
    const sources = [source('https://a.org/1'), source('https://b.org/2')]
    expect(label({ sources, alternatives: 'Otra versión.' })).toBe('sin_confirmar')
    expect(label({ sources, alternatives: null })).toBe('comprobado')
  })

  it('needs two links that open, from different and reliable domains', () => {
    expect(label({ sources: [source('https://a.org/1'), source('https://b.org/2')] })).toBe('comprobado')
  })

  it('counts one link per domain', () => {
    expect(label({ sources: [source('https://a.org/1'), source('https://a.org/2')] })).toBe('una_fuente')
    expect(label({ sources: [source('https://www.a.org/1'), source('https://blog.a.org/2')] })).toBe('una_fuente')
  })

  it('does not take a shared public suffix for a shared domain', () => {
    expect(label({ sources: [source('https://a.co.uk/1'), source('https://b.co.uk/2')] })).toBe('comprobado')
  })

  it('does not count a domain of the unreliable list, nor its subdomains', () => {
    expect(label({ sources: [source('https://a.org/1'), source('https://es.wikipedia.org/wiki/x')] })).toBe(
      'una_fuente',
    )
    expect(label({ sources: [source('https://reddit.com/r/x'), source('https://pan.blogspot.com/y')] })).toBe(
      'sin_confirmar',
    )
  })

  it('does not mistake a longer name for an unreliable domain', () => {
    expect(label({ sources: [source('https://notwikipedia.org/1'), source('https://a.org/2')] })).toBe('comprobado')
  })

  it.each(['no_abre', 'sin_comprobar', null] as const)('does not count a link in state %s', (state) => {
    expect(label({ sources: [source('https://a.org/1'), source('https://b.org/2', state)] })).toBe('una_fuente')
    expect(label({ sources: [source('https://a.org/1', state), source('https://b.org/2', state)] })).toBe(
      'sin_confirmar',
    )
  })

  it('does not count a source without a link', () => {
    expect(label({ sources: [{ url: null, link: null }, source('https://a.org/1')] })).toBe('una_fuente')
  })

  it('lets the AI lower the label, never raise it', () => {
    const two = [source('https://a.org/1'), source('https://b.org/2')]
    expect(label({ proposed: 'una_fuente', sources: two })).toBe('una_fuente')
    expect(label({ proposed: 'sin_confirmar', sources: two })).toBe('sin_confirmar')
    expect(label({ proposed: 'comprobado', sources: [source('https://a.org/1')] })).toBe('una_fuente')
    expect(label({ proposed: 'comprobado', sources: [] })).toBe('sin_confirmar')
  })

  it('always labels the facts of the creator as theirs', () => {
    expect(label({ origin: 'creador', proposed: 'del_creador', sources: [] })).toBe('del_creador')
    expect(
      label({
        origin: 'creador',
        proposed: 'del_creador',
        sources: [source('https://a.org/1'), source('https://b.org/2')],
      }),
    ).toBe('del_creador')
  })
})

describe('domainOf', () => {
  it('reduces a host to its registrable domain', () => {
    expect(domainOf('https://www.elpais.com/x')).toBe('elpais.com')
    expect(domainOf('https://a.b.bbc.co.uk/x')).toBe('bbc.co.uk')
    expect(domainOf('https://PAN.Example.ORG./x')).toBe('example.org')
  })

  it('gives null when the address does not parse', () => {
    expect(domainOf('no es una dirección')).toBeNull()
  })
})

describe('seenSources', () => {
  const sources = [source('https://a.org/1'), source('https://b.org/inventada')]

  it('discards the addresses the provider did not see', () => {
    expect(seenSources(sources, ['https://a.org/1'])).toEqual([sources[0]])
  })

  it('compares without fragment, trailing slash or case in the host', () => {
    expect(seenSources([source('https://A.org/1/#parte')], ['https://a.org/1'])).toHaveLength(1)
  })

  it('keeps them all when the provider does not say what it saw', () => {
    expect(seenSources(sources, undefined)).toEqual(sources)
  })
})
