import { space } from '../primitive/space.ts'
import { semantic, type SemanticToken } from '../types.ts'

/** `space-0` … `space-12`: 0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80 px. */
const steps = [
  space[0],
  space[2],
  space[4],
  space[8],
  space[12],
  space[16],
  space[20],
  space[24],
  space[32],
  space[40],
  space[48],
  space[64],
  space[80],
]

export const spaceTokens: readonly SemanticToken[] = steps.map((ref, step) =>
  semantic({
    name: `space-${step}`,
    category: 'space',
    value: ref,
    description: `Paso ${step} de la escala de espaciado (márgenes, rellenos y huecos).`,
  }),
)
