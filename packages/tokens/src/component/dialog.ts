import { component, type ComponentToken } from '../types.ts'
import { sem } from './semantic-ref.ts'

export const dialogTokens: readonly ComponentToken[] = [
  component({
    name: 'dialog-bg',
    category: 'glass',
    value: sem('glass-bg'),
    description: 'Fondo de cristal del diálogo.',
  }),
  component({
    name: 'dialog-border',
    category: 'glass',
    value: sem('glass-border'),
    description: 'Borde de cristal del diálogo.',
  }),
  component({
    name: 'dialog-shadow',
    category: 'shadow',
    value: sem('shadow-3'),
    description: 'Elevación del diálogo.',
  }),
  component({ name: 'dialog-radius', category: 'radius', value: sem('radius-xl'), description: 'Radio del diálogo.' }),
  component({
    name: 'dialog-padding',
    category: 'space',
    value: sem('space-7'),
    description: 'Relleno interior del diálogo.',
  }),
]
