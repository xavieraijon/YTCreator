import { component, type ComponentToken } from '../types.ts'
import { sem } from './semantic-ref.ts'

export const progressBarTokens: readonly ComponentToken[] = [
  component({
    name: 'progress-bar-track',
    category: 'color',
    value: sem('color-surface-sunken'),
    description: 'Fondo del carril.',
  }),
  component({
    name: 'progress-bar-fill',
    category: 'color',
    value: sem('color-accent'),
    description: 'Parte completada.',
  }),
  component({
    name: 'progress-bar-height',
    category: 'space',
    value: sem('space-3'),
    description: 'Grosor de la barra.',
  }),
]
