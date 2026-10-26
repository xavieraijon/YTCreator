import { component, type ComponentToken } from '../types.ts'
import { sem } from './semantic-ref.ts'

export const aiWorkingTokens: readonly ComponentToken[] = [
  component({
    name: 'ai-working-aurora',
    category: 'color',
    value: sem('gradient-ai'),
    description: 'Degradado de la aurora que indica que la IA trabaja.',
  }),
  component({
    name: 'ai-working-cycle',
    category: 'motion',
    value: sem('duration-ai-cycle'),
    description: 'Una vuelta completa de la aurora.',
  }),
  component({
    name: 'ai-working-bg',
    category: 'color',
    value: sem('color-surface-raised'),
    description: 'Superficie sólida sobre la aurora, para que el texto se lea.',
  }),
  component({
    name: 'ai-working-text',
    category: 'color',
    value: sem('color-text-primary'),
    description: 'Texto que dice qué está haciendo la IA.',
  }),
  component({
    name: 'ai-working-radius',
    category: 'radius',
    value: sem('radius-lg'),
    description: 'Radio del contenedor.',
  }),
]
