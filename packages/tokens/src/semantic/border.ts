import { borderWidth } from '../primitive/border.ts'
import { semantic, type SemanticToken } from '../types.ts'

export const borderTokens: readonly SemanticToken[] = [
  semantic({
    name: 'border-width-default',
    category: 'border',
    value: borderWidth[1],
    description: 'Grosor de borde normal.',
  }),
  semantic({
    name: 'border-width-strong',
    category: 'border',
    value: borderWidth[2],
    description: 'Grosor de borde marcado: elemento seleccionado.',
  }),
  semantic({
    name: 'border-width-heavy',
    category: 'border',
    value: borderWidth[3],
    description: 'Grosor de borde destacado: el anillo de la firma de la IA.',
  }),
  semantic({
    name: 'focus-ring-width',
    category: 'border',
    value: borderWidth[2],
    description: 'Grosor del anillo de foco.',
  }),
  semantic({
    name: 'focus-ring-offset',
    category: 'border',
    value: borderWidth[2],
    description: 'Separación entre el anillo de foco y el control.',
  }),
]
