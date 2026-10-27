import { component, type ComponentToken } from '../types.ts'
import { sem } from './semantic-ref.ts'

export const errorMessageTokens: readonly ComponentToken[] = [
  component({
    name: 'error-message-bg',
    category: 'color',
    value: sem('color-danger-bg'),
    description: 'Fondo del mensaje de error.',
  }),
  component({
    name: 'error-message-border',
    category: 'color',
    value: sem('color-danger-border'),
    description: 'Borde del mensaje de error.',
  }),
  component({
    name: 'error-message-text',
    category: 'color',
    value: sem('color-danger-fg'),
    description: 'Título e icono del mensaje de error.',
  }),
  component({
    name: 'error-message-radius',
    category: 'radius',
    value: sem('radius-lg'),
    description: 'Radio del mensaje de error.',
  }),
]
