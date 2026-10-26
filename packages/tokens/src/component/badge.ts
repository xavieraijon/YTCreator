import { component, type ComponentToken } from '../types.ts'
import { sem } from './semantic-ref.ts'

export const badgeTokens: readonly ComponentToken[] = [
  component({
    name: 'badge-bg',
    category: 'color',
    value: sem('color-surface-sunken'),
    description: 'Fondo del tono neutro.',
  }),
  component({
    name: 'badge-border',
    category: 'color',
    value: sem('color-border-default'),
    description: 'Borde del tono neutro.',
  }),
  component({
    name: 'badge-text',
    category: 'color',
    value: sem('color-text-primary'),
    description: 'Texto del tono neutro.',
  }),
  component({
    name: 'badge-radius',
    category: 'radius',
    value: sem('radius-full'),
    description: 'Radio de la etiqueta.',
  }),
  component({ name: 'badge-height', category: 'space', value: sem('target-min'), description: 'Alto mínimo.' }),
  component({
    name: 'badge-padding-inline',
    category: 'space',
    value: sem('space-3'),
    description: 'Relleno lateral.',
  }),
]
