import { component, type ComponentToken } from '../types.ts'
import { sem } from './semantic-ref.ts'

export const tooltipTokens: readonly ComponentToken[] = [
  component({
    name: 'tooltip-bg',
    category: 'color',
    value: sem('color-surface-inverse'),
    description: 'Fondo invertido: se distingue de cualquier superficie.',
  }),
  component({
    name: 'tooltip-text',
    category: 'color',
    value: sem('color-text-inverse'),
    description: 'Texto sobre el fondo invertido.',
  }),
  component({
    name: 'tooltip-shadow',
    category: 'shadow',
    value: sem('shadow-2'),
    description: 'Elevación de capa flotante.',
  }),
  component({
    name: 'tooltip-radius',
    category: 'radius',
    value: sem('radius-sm'),
    description: 'Radio de la burbuja.',
  }),
  component({
    name: 'tooltip-padding-block',
    category: 'space',
    value: sem('space-2'),
    description: 'Relleno vertical.',
  }),
  component({
    name: 'tooltip-padding-inline',
    category: 'space',
    value: sem('space-3'),
    description: 'Relleno lateral.',
  }),
]
