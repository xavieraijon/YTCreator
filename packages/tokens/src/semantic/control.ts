import { space } from '../primitive/space.ts'
import { semantic, type SemanticToken } from '../types.ts'

export const controlTokens: readonly SemanticToken[] = [
  semantic({
    name: 'control-height-sm',
    category: 'space',
    value: space[32],
    description: 'Altura de controles compactos.',
  }),
  semantic({
    name: 'control-height-md',
    category: 'space',
    value: space[40],
    description: 'Altura de controles por defecto.',
  }),
  semantic({
    name: 'control-height-lg',
    category: 'space',
    value: space[44],
    description: 'Altura de controles grandes y de pantallas táctiles.',
  }),
  semantic({
    name: 'icon-size-sm',
    category: 'space',
    value: space[16],
    description: 'Icono dentro de texto pequeño.',
  }),
  semantic({ name: 'icon-size-md', category: 'space', value: space[20], description: 'Icono por defecto.' }),
  semantic({ name: 'icon-size-lg', category: 'space', value: space[24], description: 'Icono destacado.' }),
  semantic({
    name: 'target-min',
    category: 'space',
    value: space[24],
    description: 'Tamaño mínimo de cualquier objetivo táctil o de puntero (WCAG 2.5.8).',
  }),
]
