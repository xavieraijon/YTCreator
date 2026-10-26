import { radius } from '../primitive/radius.ts'
import { semantic, type SemanticToken } from '../types.ts'

export const radiusTokens: readonly SemanticToken[] = [
  semantic({ name: 'radius-sm', category: 'radius', value: radius[4], description: 'Insignias y casillas.' }),
  semantic({ name: 'radius-md', category: 'radius', value: radius[8], description: 'Botones y campos.' }),
  semantic({ name: 'radius-lg', category: 'radius', value: radius[12], description: 'Tarjetas y menús.' }),
  semantic({ name: 'radius-xl', category: 'radius', value: radius[16], description: 'Diálogos y paneles grandes.' }),
  semantic({ name: 'radius-full', category: 'radius', value: radius.pill, description: 'Píldoras y avatares.' }),
]
