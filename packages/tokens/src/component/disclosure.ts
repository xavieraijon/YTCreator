import { component, type ComponentToken } from '../types.ts'
import { sem } from './semantic-ref.ts'

export const disclosureTokens: readonly ComponentToken[] = [
  component({
    name: 'disclosure-border',
    category: 'color',
    value: sem('color-border-subtle'),
    description: 'Línea que cierra el bloque plegable.',
  }),
]
