import { component, type ComponentToken } from '../types.ts'
import { sem } from './semantic-ref.ts'

export const cardTokens: readonly ComponentToken[] = [
  component({
    name: 'card-bg',
    category: 'color',
    value: sem('color-surface-raised'),
    description: 'Fondo sólido: una tarjeta nunca es de cristal.',
  }),
  component({
    name: 'card-border',
    category: 'color',
    value: sem('color-border-subtle'),
    description: 'Borde en reposo.',
  }),
  component({
    name: 'card-border-hover',
    category: 'color',
    value: sem('color-border-strong'),
    description: 'Borde de una tarjeta interactiva con el puntero encima.',
  }),
  component({ name: 'card-shadow', category: 'shadow', value: sem('shadow-1'), description: 'Elevación en reposo.' }),
  component({
    name: 'card-shadow-hover',
    category: 'shadow',
    value: sem('shadow-2'),
    description: 'Elevación de una tarjeta interactiva con el puntero encima.',
  }),
  component({ name: 'card-radius', category: 'radius', value: sem('radius-lg'), description: 'Radio de la tarjeta.' }),
  component({ name: 'card-padding', category: 'space', value: sem('space-6'), description: 'Relleno interior.' }),
]
