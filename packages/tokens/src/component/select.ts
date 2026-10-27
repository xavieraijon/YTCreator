import { component, type ComponentToken } from '../types.ts'
import { sem } from './semantic-ref.ts'

export const selectTokens: readonly ComponentToken[] = [
  component({
    name: 'select-menu-bg',
    category: 'color',
    value: sem('color-surface-raised'),
    description: 'Fondo sólido del desplegable.',
  }),
  component({
    name: 'select-menu-border',
    category: 'color',
    value: sem('color-border-subtle'),
    description: 'Borde del desplegable.',
  }),
  component({
    name: 'select-menu-shadow',
    category: 'shadow',
    value: sem('shadow-2'),
    description: 'Elevación del desplegable, la de los popovers.',
  }),
  component({
    name: 'select-menu-radius',
    category: 'radius',
    value: sem('radius-lg'),
    description: 'Radio del desplegable.',
  }),
  component({
    name: 'select-option-radius',
    category: 'radius',
    value: sem('radius-md'),
    description: 'Radio de cada opción.',
  }),
  component({
    name: 'select-option-highlight',
    category: 'color',
    value: sem('color-accent-subtle'),
    description: 'Fondo de la opción bajo el puntero o el teclado.',
  }),
  component({
    name: 'select-option-check',
    category: 'color',
    value: sem('color-text-accent'),
    description: 'Marca de la opción elegida.',
  }),
]
