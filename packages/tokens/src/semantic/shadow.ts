import { shadow } from '../primitive/shadow.ts'
import { semantic, type SemanticToken } from '../types.ts'

export const shadowTokens: readonly SemanticToken[] = [
  semantic({ name: 'shadow-1', category: 'shadow', value: shadow.low, description: 'Elevación de tarjetas.' }),
  semantic({ name: 'shadow-2', category: 'shadow', value: shadow.mid, description: 'Elevación de popovers y menús.' }),
  semantic({ name: 'shadow-3', category: 'shadow', value: shadow.high, description: 'Elevación de diálogos.' }),
  semantic({
    name: 'glow-accent',
    category: 'shadow',
    value: shadow.accent,
    description: 'Brillo de marca alrededor de la acción principal.',
  }),
  semantic({
    name: 'glow-ai',
    category: 'shadow',
    value: shadow.ai,
    description: 'Brillo que acompaña al trabajo de la IA en curso.',
  }),
]
