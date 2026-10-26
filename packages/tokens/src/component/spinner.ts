import { component, type ComponentToken } from '../types.ts'
import { sem } from './semantic-ref.ts'

export const spinnerTokens: readonly ComponentToken[] = [
  component({
    name: 'spinner-color',
    category: 'color',
    value: sem('color-text-accent'),
    description: 'Color del indicador de espera.',
  }),
]
