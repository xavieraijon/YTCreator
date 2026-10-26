import { component, type ComponentToken } from '../types.ts'
import { sem } from './semantic-ref.ts'

export const themeSwitcherTokens: readonly ComponentToken[] = [
  component({
    name: 'theme-switcher-bg',
    category: 'color',
    value: sem('color-surface-sunken'),
    description: 'Fondo del carril que agrupa las opciones de tema.',
  }),
  component({
    name: 'theme-switcher-border',
    category: 'color',
    value: sem('color-border-subtle'),
    description: 'Borde del carril.',
  }),
  component({
    name: 'theme-switcher-radius',
    category: 'radius',
    value: sem('radius-full'),
    description: 'Radio del carril y de cada opción.',
  }),
  component({
    name: 'theme-switcher-padding',
    category: 'space',
    value: sem('space-1'),
    description: 'Separación entre el carril y las opciones.',
  }),
  component({
    name: 'theme-switcher-option-padding-inline',
    category: 'space',
    value: sem('space-4'),
    description: 'Relleno lateral de cada opción.',
  }),
  component({
    name: 'theme-switcher-option-height',
    category: 'space',
    value: sem('target-min'),
    description: 'Alto mínimo de cada opción (zona táctil).',
  }),
  component({
    name: 'theme-switcher-option-text',
    category: 'color',
    value: sem('color-text-secondary'),
    description: 'Texto de las opciones no elegidas.',
  }),
  component({
    name: 'theme-switcher-option-text-selected',
    category: 'color',
    value: sem('color-text-primary'),
    description: 'Texto de la opción elegida.',
  }),
  component({
    name: 'theme-switcher-option-bg-selected',
    category: 'color',
    value: sem('color-surface-raised'),
    description: 'Fondo de la opción elegida.',
  }),
  component({
    name: 'theme-switcher-option-shadow-selected',
    category: 'shadow',
    value: sem('shadow-1'),
    description: 'Elevación de la opción elegida.',
  }),
]
