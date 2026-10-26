import { component, type ComponentToken } from '../types.ts'
import { sem } from './semantic-ref.ts'

export const tabsTokens: readonly ComponentToken[] = [
  component({
    name: 'tabs-border',
    category: 'color',
    value: sem('color-border-subtle'),
    description: 'Línea bajo la lista de pestañas.',
  }),
  component({
    name: 'tabs-indicator',
    category: 'color',
    value: sem('color-accent'),
    description: 'Subrayado de la pestaña elegida.',
  }),
]
