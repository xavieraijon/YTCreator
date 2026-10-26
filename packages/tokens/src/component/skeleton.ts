import { component, type ComponentToken } from '../types.ts'
import { sem } from './semantic-ref.ts'

export const skeletonTokens: readonly ComponentToken[] = [
  component({
    name: 'skeleton-bg',
    category: 'color',
    value: sem('color-border-subtle'),
    description: 'Color del bloque de carga.',
  }),
]
