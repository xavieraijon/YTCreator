import { component, type ComponentToken } from '../types.ts'
import { sem } from './semantic-ref.ts'

export const buttonTokens: readonly ComponentToken[] = [
  component({
    name: 'button-bg',
    category: 'color',
    value: sem('color-surface-raised'),
    description: 'Fondo del botón secundario.',
  }),
  component({
    name: 'button-bg-hover',
    category: 'color',
    value: sem('color-surface-sunken'),
    description: 'Fondo del botón secundario con el puntero encima.',
  }),
  component({
    name: 'button-bg-active',
    category: 'color',
    value: sem('color-surface-sunken'),
    description: 'Fondo del botón secundario pulsado.',
  }),
  component({
    name: 'button-border',
    category: 'color',
    value: sem('color-border-strong'),
    description: 'Borde del botón secundario: 3:1 con el fondo.',
  }),
  component({
    name: 'button-border-hover',
    category: 'color',
    value: sem('color-text-primary'),
    description: 'Borde del botón secundario con el puntero encima.',
  }),
  component({
    name: 'button-text',
    category: 'color',
    value: sem('color-text-primary'),
    description: 'Texto del botón secundario.',
  }),
  component({
    name: 'button-text-hover',
    category: 'color',
    value: sem('color-text-primary'),
    description: 'Texto del botón secundario y fantasma con el puntero encima.',
  }),
  component({
    name: 'button-primary-bg',
    category: 'color',
    value: sem('color-accent'),
    description: 'Fondo del botón principal.',
  }),
  component({
    name: 'button-primary-bg-hover',
    category: 'color',
    value: sem('color-accent-hover'),
    description: 'Fondo del botón principal con el puntero encima.',
  }),
  component({
    name: 'button-primary-bg-active',
    category: 'color',
    value: sem('color-accent-active'),
    description: 'Fondo del botón principal pulsado.',
  }),
  component({
    name: 'button-primary-text',
    category: 'color',
    value: sem('color-text-on-accent'),
    description: 'Texto del botón principal.',
  }),
  component({
    name: 'button-ghost-bg-hover',
    category: 'color',
    value: sem('color-surface-sunken'),
    description: 'Fondo del botón fantasma con el puntero encima.',
  }),
  component({
    name: 'button-ghost-text',
    category: 'color',
    value: sem('color-text-secondary'),
    description: 'Texto del botón fantasma.',
  }),
  component({
    name: 'button-danger-bg',
    category: 'color',
    value: sem('color-danger-bg'),
    description: 'Fondo del botón de peligro.',
  }),
  component({
    name: 'button-danger-border',
    category: 'color',
    value: sem('color-danger-border'),
    description: 'Borde del botón de peligro.',
  }),
  component({
    name: 'button-danger-text',
    category: 'color',
    value: sem('color-danger-fg'),
    description: 'Texto del botón de peligro.',
  }),
  component({ name: 'button-radius', category: 'radius', value: sem('radius-md'), description: 'Radio del botón.' }),
  component({
    name: 'button-padding-inline',
    category: 'space',
    value: sem('space-5'),
    description: 'Relleno lateral del tamaño mediano.',
  }),
]
