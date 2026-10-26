import type { SemanticToken } from '../types.ts'
import { borderTokens } from './border.ts'
import { colorTokens } from './color.ts'
import { controlTokens } from './control.ts'
import { glassTokens } from './glass.ts'
import { layerTokens } from './layer.ts'
import { motionTokens } from './motion.ts'
import { radiusTokens } from './radius.ts'
import { shadowTokens } from './shadow.ts'
import { spaceTokens } from './space.ts'
import { typeTokens } from './type.ts'

export const semanticTokens: readonly SemanticToken[] = [
  ...colorTokens,
  ...glassTokens,
  ...shadowTokens,
  ...spaceTokens,
  ...typeTokens,
  ...radiusTokens,
  ...borderTokens,
  ...layerTokens,
  ...motionTokens,
  ...controlTokens,
]
