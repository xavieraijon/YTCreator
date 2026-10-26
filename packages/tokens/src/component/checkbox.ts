import { component, type ComponentToken } from '../types.ts'
import { sem } from './semantic-ref.ts'

export const checkboxTokens: readonly ComponentToken[] = [
  component({
    name: 'checkbox-bg',
    category: 'color',
    value: sem('color-surface'),
    description: 'Fondo de la casilla sin marcar.',
  }),
  component({
    name: 'checkbox-border',
    category: 'color',
    value: sem('color-border-strong'),
    description: 'Borde de la casilla sin marcar: 3:1 con el fondo.',
  }),
  component({
    name: 'checkbox-border-hover',
    category: 'color',
    value: sem('color-text-primary'),
    description: 'Borde con el puntero encima.',
  }),
  component({
    name: 'checkbox-checked-bg',
    category: 'color',
    value: sem('color-accent'),
    description: 'Fondo de la casilla marcada o indeterminada.',
  }),
  component({
    name: 'checkbox-checked-mark',
    category: 'color',
    value: sem('color-text-on-accent'),
    description: 'Marca de la casilla marcada o indeterminada.',
  }),
  component({
    name: 'checkbox-radius',
    category: 'radius',
    value: sem('radius-sm'),
    description: 'Radio de la casilla.',
  }),
  component({
    name: 'checkbox-size',
    category: 'space',
    value: sem('icon-size-md'),
    description: 'Lado de la casilla; el objetivo táctil mide al menos 24 px.',
  }),
]
