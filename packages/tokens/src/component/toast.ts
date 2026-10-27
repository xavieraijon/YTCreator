import { component, type ComponentToken } from '../types.ts'
import { sem } from './semantic-ref.ts'

export const toastTokens: readonly ComponentToken[] = [
  component({
    name: 'toast-bg',
    category: 'color',
    value: sem('color-surface-raised'),
    description: 'Fondo sólido del aviso.',
  }),
  component({
    name: 'toast-border',
    category: 'color',
    value: sem('color-border-subtle'),
    description: 'Borde del aviso; el borde izquierdo toma el color del tono.',
  }),
  component({ name: 'toast-shadow', category: 'shadow', value: sem('shadow-3'), description: 'Elevación del aviso.' }),
  component({ name: 'toast-radius', category: 'radius', value: sem('radius-lg'), description: 'Radio del aviso.' }),
]
