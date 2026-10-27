import { component, type ComponentToken } from '../types.ts'
import { sem } from './semantic-ref.ts'

export const radioGroupTokens: readonly ComponentToken[] = [
  component({ name: 'radio-bg', category: 'color', value: sem('color-surface'), description: 'Fondo del círculo.' }),
  component({
    name: 'radio-border',
    category: 'color',
    value: sem('color-border-strong'),
    description: 'Borde del círculo sin elegir: 3:1 con el fondo.',
  }),
  component({
    name: 'radio-border-hover',
    category: 'color',
    value: sem('color-text-primary'),
    description: 'Borde con el puntero encima.',
  }),
  component({
    name: 'radio-checked',
    category: 'color',
    value: sem('color-accent'),
    description: 'Punto, borde e icono de la opción elegida.',
  }),
  component({
    name: 'radio-size',
    category: 'space',
    value: sem('icon-size-md'),
    description: 'Diámetro del círculo.',
  }),
  component({
    name: 'radio-dot-size',
    category: 'space',
    value: sem('space-4'),
    description: 'Diámetro del punto de la opción elegida.',
  }),
  component({
    name: 'radio-card-bg',
    category: 'color',
    value: sem('color-surface-raised'),
    description: 'Fondo de una opción con aspecto de tarjeta.',
  }),
  component({
    name: 'radio-card-border',
    category: 'color',
    value: sem('color-border-default'),
    description: 'Borde de una opción con aspecto de tarjeta.',
  }),
  component({
    name: 'radio-card-radius',
    category: 'radius',
    value: sem('radius-lg'),
    description: 'Radio de una opción con aspecto de tarjeta.',
  }),
]
