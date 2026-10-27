import { component, type ComponentToken } from '../types.ts'
import { sem } from './semantic-ref.ts'

export const emptyStateTokens: readonly ComponentToken[] = [
  component({
    name: 'empty-state-border',
    category: 'color',
    value: sem('color-border-default'),
    description: 'Borde discontinuo del hueco vacío.',
  }),
  component({
    name: 'empty-state-icon-bg',
    category: 'color',
    value: sem('color-accent-subtle'),
    description: 'Fondo del icono.',
  }),
  component({
    name: 'empty-state-icon',
    category: 'color',
    value: sem('color-text-accent'),
    description: 'Color del icono.',
  }),
  component({
    name: 'empty-state-radius',
    category: 'radius',
    value: sem('radius-lg'),
    description: 'Radio del hueco vacío.',
  }),
  component({
    name: 'empty-state-padding',
    category: 'space',
    value: sem('space-9'),
    description: 'Relleno interior.',
  }),
]
