import { glass } from '../primitive/glass.ts'
import { semantic, type SemanticToken } from '../types.ts'
import { colorSurfaceRaised } from './color.ts'

export const glassTokens: readonly SemanticToken[] = [
  semantic({
    name: 'glass-bg',
    category: 'glass',
    value: { light: glass['bg-light'], dark: glass['bg-dark'] },
    description: 'Fondo de cristal translúcido. Con transparencia reducida pasa a la superficie elevada.',
    reducedTransparency: colorSurfaceRaised.value,
  }),
  semantic({
    name: 'glass-border',
    category: 'glass',
    value: { light: glass['border-light'], dark: glass['border-dark'] },
    description: 'Borde del cristal.',
  }),
  semantic({
    name: 'glass-highlight',
    category: 'glass',
    value: { light: glass['highlight-light'], dark: glass['highlight-dark'] },
    description: 'Color de la luz interior de 1 px en el borde superior del cristal.',
  }),
  semantic({
    name: 'glass-blur',
    category: 'glass',
    value: glass['blur-20'],
    description: 'Filtro del fondo del cristal. Con transparencia reducida no se aplica.',
    reducedTransparency: glass['blur-off'],
  }),
]
