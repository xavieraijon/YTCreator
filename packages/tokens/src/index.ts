import { componentTokens } from './component/index.ts'
import { primitiveTokens } from './primitive/index.ts'
import { semanticTokens } from './semantic/index.ts'
import type { Token } from './types.ts'

export * from './types.ts'
export { primitiveTokens, semanticTokens, componentTokens }

export const tokens: readonly Token[] = [...primitiveTokens, ...semanticTokens, ...componentTokens]
