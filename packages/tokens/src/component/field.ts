import { component, type ComponentToken } from '../types.ts'
import { sem } from './semantic-ref.ts'

export const fieldTokens: readonly ComponentToken[] = [
  component({
    name: 'field-gap',
    category: 'space',
    value: sem('space-2'),
    description: 'Separación entre etiqueta, ayuda, control y error.',
  }),
  component({
    name: 'field-label',
    category: 'color',
    value: sem('color-text-primary'),
    description: 'Texto de la etiqueta.',
  }),
  component({
    name: 'field-description',
    category: 'color',
    value: sem('color-text-secondary'),
    description: 'Texto de ayuda y marca «opcional».',
  }),
  component({
    name: 'field-error',
    category: 'color',
    value: sem('color-danger-fg'),
    description: 'Texto, icono y borde del error.',
  }),
  component({ name: 'field-bg', category: 'color', value: sem('color-surface'), description: 'Fondo del control.' }),
  component({
    name: 'field-text',
    category: 'color',
    value: sem('color-text-primary'),
    description: 'Texto escrito en el control.',
  }),
  component({
    name: 'field-border',
    category: 'color',
    value: sem('color-border-strong'),
    description: 'Borde del control: contraste de 3:1 con el fondo (WCAG 1.4.11).',
  }),
  component({
    name: 'field-border-hover',
    category: 'color',
    value: sem('color-text-primary'),
    description: 'Borde con el puntero encima o con el foco.',
  }),
  component({ name: 'field-radius', category: 'radius', value: sem('radius-md'), description: 'Radio del control.' }),
  component({
    name: 'field-padding-inline',
    category: 'space',
    value: sem('space-4'),
    description: 'Relleno lateral del control.',
  }),
]
