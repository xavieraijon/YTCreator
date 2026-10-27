import { fontFamily, fontSize, fontWeight, letterSpacing, lineHeight } from '../primitive/type.ts'
import { semantic, type SemanticToken } from '../types.ts'

const sizes = [
  ['xs', fontSize[12], 'Etiquetas pequeñas y metadatos.'],
  ['sm', fontSize[14], 'Texto de controles y ayudas.'],
  ['base', fontSize[16], 'Texto de lectura.'],
  ['md', fontSize[18], 'Texto destacado.'],
  ['lg', fontSize[20], 'Títulos de tarjeta.'],
  ['xl', fontSize[24], 'Títulos de sección.'],
  ['2xl', fontSize[30], 'Títulos de página.'],
  ['3xl', fontSize[36], 'Titulares.'],
  ['4xl', fontSize[48], 'Titulares de portada.'],
] as const

export const typeTokens: readonly SemanticToken[] = [
  semantic({
    name: 'font-family-ui',
    category: 'type',
    value: fontFamily.geist,
    description: 'Familia de toda la interfaz.',
  }),
  semantic({
    name: 'font-family-mono',
    category: 'type',
    value: fontFamily['geist-mono'],
    description: 'Familia monoespaciada: cifras tabulares y fragmentos técnicos.',
  }),
  ...sizes.map(([size, ref, description]) =>
    semantic({ name: `font-size-${size}`, category: 'type', value: ref, description }),
  ),
  semantic({
    name: 'font-weight-regular',
    category: 'type',
    value: fontWeight[400],
    description: 'Peso del texto corrido.',
  }),
  semantic({
    name: 'font-weight-medium',
    category: 'type',
    value: fontWeight[500],
    description: 'Peso de controles y etiquetas.',
  }),
  semantic({ name: 'font-weight-semibold', category: 'type', value: fontWeight[600], description: 'Peso de títulos.' }),
  semantic({
    name: 'line-height-tight',
    category: 'type',
    value: lineHeight[115],
    description: 'Interlineado de titulares.',
  }),
  semantic({
    name: 'line-height-ui',
    category: 'type',
    value: lineHeight[145],
    description: 'Interlineado de la interfaz.',
  }),
  semantic({
    name: 'line-height-reading',
    category: 'type',
    value: lineHeight[160],
    description: 'Interlineado de textos largos.',
  }),
  semantic({
    name: 'letter-spacing-tight',
    category: 'type',
    value: letterSpacing.condensed,
    description: 'Ajuste negativo de titulares (tamaños xl y mayores).',
  }),
]
