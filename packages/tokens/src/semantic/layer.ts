import { layer } from '../primitive/layer.ts'
import { semantic, type SemanticToken } from '../types.ts'

export const layerTokens: readonly SemanticToken[] = [
  semantic({ name: 'z-base', category: 'layer', value: layer[0], description: 'Contenido normal.' }),
  semantic({
    name: 'z-raised',
    category: 'layer',
    value: layer[1],
    description: 'Elementos que se superponen a sus vecinos.',
  }),
  semantic({ name: 'z-sticky', category: 'layer', value: layer[100], description: 'Cabeceras y barras fijas.' }),
  semantic({ name: 'z-overlay', category: 'layer', value: layer[1000], description: 'Diálogos y su velo.' }),
  semantic({
    name: 'z-popover',
    category: 'layer',
    value: layer[1100],
    description: 'Menús, popovers y descripciones emergentes.',
  }),
  semantic({
    name: 'z-toast',
    category: 'layer',
    value: layer[1200],
    description: 'Avisos breves, por encima de todo.',
  }),
]
