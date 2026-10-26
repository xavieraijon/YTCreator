import { component, type ComponentToken } from '../types.ts'
import { sem } from './semantic-ref.ts'

export const switchTokens: readonly ComponentToken[] = [
  component({
    name: 'switch-track',
    category: 'color',
    value: sem('color-surface-sunken'),
    description: 'Pista apagada.',
  }),
  component({
    name: 'switch-track-border',
    category: 'color',
    value: sem('color-border-strong'),
    description: 'Borde de la pista apagada: 3:1 con el fondo.',
  }),
  component({
    name: 'switch-track-border-hover',
    category: 'color',
    value: sem('color-text-primary'),
    description: 'Borde de la pista apagada con el puntero encima.',
  }),
  component({
    name: 'switch-track-on',
    category: 'color',
    value: sem('color-accent'),
    description: 'Pista encendida.',
  }),
  component({
    name: 'switch-thumb',
    category: 'color',
    value: sem('color-text-secondary'),
    description: 'Botón deslizante apagado.',
  }),
  component({
    name: 'switch-thumb-on',
    category: 'color',
    value: sem('color-text-on-accent'),
    description: 'Botón deslizante encendido.',
  }),
  component({
    name: 'switch-track-width',
    category: 'space',
    value: sem('control-height-lg'),
    description: 'Ancho de la pista.',
  }),
  component({
    name: 'switch-thumb-size',
    category: 'space',
    value: sem('icon-size-sm'),
    description: 'Diámetro del botón deslizante.',
  }),
]
