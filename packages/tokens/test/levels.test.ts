import { describe, expect, it } from 'vitest'
import { isThemed, references, tokens, type Level } from '../src/index.ts'

const rank: Record<Level, number> = { primitive: 0, semantic: 1, component: 2 }
const byName = new Map(tokens.map((token) => [token.name, token]))

describe('token levels (FR-002)', () => {
  it('names are kebab-case and unique', () => {
    const invalid = tokens.filter((token) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(token.name)).map((t) => t.name)
    expect(invalid).toEqual([])

    const seen = new Set<string>()
    const duplicated = tokens.filter((token) => seen.size === seen.add(token.name).size).map((t) => t.name)
    expect(duplicated).toEqual([])
  })

  it('every reference points to an existing token of a lower level', () => {
    const errors = tokens.flatMap((token) =>
      references(token).flatMap((ref) => {
        const target = byName.get(ref.name)
        if (!target) return [`${token.name} → ${ref.name}: no existe`]
        if (target.level !== ref.level) return [`${token.name} → ${ref.name}: nivel declarado distinto del real`]
        if (rank[target.level] >= rank[token.level]) {
          return [`${token.name} (${token.level}) → ${ref.name} (${target.level}): mismo nivel o superior`]
        }
        return []
      }),
    )
    expect(errors).toEqual([])
  })

  it('component tokens never point to a primitive', () => {
    const errors = tokens
      .filter((token) => token.level === 'component')
      .flatMap((token) =>
        references(token)
          .filter((ref) => ref.level === 'primitive')
          .map(() => token.name),
      )
    expect(errors).toEqual([])
  })

  it('semantic and component tokens have a description', () => {
    const missing = tokens
      .filter((token) => token.level !== 'primitive' && !token.description?.trim())
      .map((token) => token.name)
    expect(missing).toEqual([])
  })

  it('every semantic colour has a light and a dark value (FR-005)', () => {
    const single = tokens
      .filter((token) => token.level === 'semantic' && token.name.startsWith('color-') && !isThemed(token.value))
      .map((token) => token.name)
    expect(single).toEqual([])
  })
})
