import type { PrimitiveToken } from '../types.ts'
import { borderWidth } from './border.ts'
import { breakpoint } from './breakpoint.ts'
import { color, gradient } from './color.ts'
import { glass } from './glass.ts'
import { layer } from './layer.ts'
import { duration, easing } from './motion.ts'
import { radius } from './radius.ts'
import { shadow } from './shadow.ts'
import { space } from './space.ts'
import { fontFamily, fontSize, fontWeight, letterSpacing, lineHeight } from './type.ts'

export const primitiveTokens: readonly PrimitiveToken[] = [
  color,
  gradient,
  space,
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  letterSpacing,
  radius,
  borderWidth,
  shadow,
  glass,
  layer,
  duration,
  easing,
  breakpoint,
].flatMap((family) => Object.values(family))
