import { semanticTokens } from '../semantic/index.ts'
import type { SemanticToken } from '../types.ts'

const byName = new Map(semanticTokens.map((token) => [token.name, token]))

/** Looks up a semantic token by name for a component token. Fails the build on a typo. */
export function sem(name: string): SemanticToken {
  const token = byName.get(name)
  if (!token) throw new Error(`Unknown semantic token: ${name}`)
  return token
}
