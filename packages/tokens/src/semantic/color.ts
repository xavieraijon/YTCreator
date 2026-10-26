import { color, gradient } from '../primitive/color.ts'
import { semantic, type SemanticToken } from '../types.ts'

const c = color

/** Backgrounds where body text is allowed. */
const surfaces = ['color-bg', 'color-surface', 'color-surface-raised', 'color-surface-sunken'] as const
const stateBackgrounds = ['color-success-bg', 'color-warning-bg', 'color-danger-bg', 'color-info-bg'] as const

// Backgrounds and surfaces

export const colorBg = semantic({
  name: 'color-bg',
  category: 'color',
  value: { light: c['neutral-50'], dark: c['neutral-950'] },
  description: 'Fondo de la aplicación, detrás de todo lo demás.',
})

export const colorSurface = semantic({
  name: 'color-surface',
  category: 'color',
  value: { light: c['neutral-0'], dark: c['neutral-900'] },
  description: 'Superficie de tarjetas y paneles apoyados sobre el fondo.',
})

export const colorSurfaceRaised = semantic({
  name: 'color-surface-raised',
  category: 'color',
  value: { light: c['neutral-0'], dark: c['neutral-850'] },
  description: 'Superficie elevada: menús, popovers y diálogos. También es el cristal sin transparencia.',
})

export const colorSurfaceSunken = semantic({
  name: 'color-surface-sunken',
  category: 'color',
  value: { light: c['neutral-100'], dark: c['neutral-950'] },
  description: 'Superficie hundida: campos, pistas de barras de progreso y zonas de código.',
})

export const colorSurfaceOverlay = semantic({
  name: 'color-surface-overlay',
  category: 'color',
  value: { light: c['scrim-light'], dark: c['scrim-dark'] },
  description: 'Velo semitransparente detrás de los diálogos. Nunca lleva texto encima.',
})

export const colorSurfaceInverse = semantic({
  name: 'color-surface-inverse',
  category: 'color',
  value: { light: c['neutral-900'], dark: c['neutral-50'] },
  description: 'Superficie invertida respecto al tema: avisos breves y descripciones emergentes.',
})

// Text and icons

const colorText = [
  semantic({
    name: 'color-text-primary',
    category: 'color',
    value: { light: c['neutral-900'], dark: c['neutral-50'] },
    description: 'Texto principal e iconos que acompañan al texto.',
    allowedOn: [...surfaces, 'color-accent-subtle', 'glass-bg', ...stateBackgrounds],
  }),
  semantic({
    name: 'color-text-secondary',
    category: 'color',
    value: { light: c['neutral-600'], dark: c['neutral-300'] },
    description: 'Texto de apoyo: descripciones, ayudas y metadatos.',
    allowedOn: [...surfaces],
  }),
  semantic({
    name: 'color-text-tertiary',
    category: 'color',
    value: { light: c['neutral-500'], dark: c['neutral-400'] },
    description: 'Texto de menor jerarquía: marcadores de posición y marcas de tiempo.',
    allowedOn: ['color-bg', 'color-surface', 'color-surface-raised'],
  }),
  semantic({
    name: 'color-text-disabled',
    category: 'color',
    value: { light: c['neutral-400'], dark: c['neutral-600'] },
    description:
      'Texto de controles desactivados. WCAG exime a los componentes inactivos del contraste mínimo, así que no tiene fondos con ratio garantizado.',
    allowedOn: [],
  }),
  semantic({
    name: 'color-text-on-accent',
    category: 'color',
    value: { light: c.white, dark: c.white },
    description: 'Texto e iconos sobre el acento sólido (botón principal).',
    allowedOn: ['color-accent', 'color-accent-hover', 'color-accent-active'],
  }),
  semantic({
    name: 'color-text-accent',
    category: 'color',
    value: { light: c['coral-700'], dark: c['coral-400'] },
    description: 'Texto con el color de marca: enlaces y énfasis.',
    allowedOn: [...surfaces, 'color-accent-subtle'],
  }),
  semantic({
    name: 'color-text-inverse',
    category: 'color',
    value: { light: c['neutral-50'], dark: c['neutral-900'] },
    description: 'Texto sobre la superficie invertida.',
    allowedOn: ['color-surface-inverse'],
  }),
]

// Borders

const colorBorder = [
  semantic({
    name: 'color-border-subtle',
    category: 'color',
    value: { light: c['neutral-200'], dark: c['neutral-800'] },
    description: 'Separadores y bordes decorativos que no identifican un control.',
  }),
  semantic({
    name: 'color-border-default',
    category: 'color',
    value: { light: c['neutral-300'], dark: c['neutral-700'] },
    description: 'Borde de tarjetas y contenedores.',
  }),
  semantic({
    name: 'color-border-strong',
    category: 'color',
    value: { light: c['neutral-500'], dark: c['neutral-500'] },
    description: 'Borde que identifica un control (campos, casillas). Contraste mínimo 3:1.',
  }),
  semantic({
    name: 'color-border-focus',
    category: 'color',
    value: { light: c['coral-600'], dark: c['coral-400'] },
    description: 'Anillo de foco visible del teclado.',
  }),
]

// Accent

const colorAccent = [
  semantic({
    name: 'color-accent',
    category: 'color',
    value: { light: c['coral-600'], dark: c['coral-600'] },
    description: 'Acento de marca sólido: acción principal y elementos activos.',
  }),
  semantic({
    name: 'color-accent-hover',
    category: 'color',
    value: { light: c['coral-700'], dark: c['coral-700'] },
    description: 'Acento al pasar el puntero.',
  }),
  semantic({
    name: 'color-accent-active',
    category: 'color',
    value: { light: c['coral-800'], dark: c['coral-800'] },
    description: 'Acento al pulsar.',
  }),
  semantic({
    name: 'color-accent-subtle',
    category: 'color',
    value: { light: c['coral-100'], dark: c['coral-900'] },
    description: 'Fondo suave con el tono de marca: elementos seleccionados y destacados.',
  }),
  semantic({
    name: 'gradient-brand',
    category: 'color',
    value: gradient.brand,
    description: 'Degradado de marca, de coral a violeta interpolado en OKLCH. Uso decorativo, nunca detrás de texto.',
  }),
  semantic({
    name: 'gradient-ai',
    category: 'color',
    value: gradient.ai,
    description: 'Degradado que señala trabajo de la IA en curso. Uso decorativo, nunca detrás de texto.',
  }),
]

// States

type State = 'success' | 'warning' | 'danger' | 'info'

const stateHue: Record<State, 'green' | 'amber' | 'red' | 'blue'> = {
  success: 'green',
  warning: 'amber',
  danger: 'red',
  info: 'blue',
}

const stateLabel: Record<State, string> = {
  success: 'éxito',
  warning: 'advertencia',
  danger: 'error o acción destructiva',
  info: 'información',
}

const colorStates = (Object.keys(stateHue) as State[]).flatMap((state) => {
  const hue = stateHue[state]
  return [
    semantic({
      name: `color-${state}-fg`,
      category: 'color',
      value: { light: c[`${hue}-700`], dark: c[`${hue}-400`] },
      description: `Texto e iconos de ${stateLabel[state]}.`,
      allowedOn: [...surfaces, `color-${state}-bg`],
    }),
    semantic({
      name: `color-${state}-bg`,
      category: 'color',
      value: { light: c[`${hue}-100`], dark: c[`${hue}-950`] },
      description: `Fondo suave de ${stateLabel[state]}.`,
    }),
    semantic({
      name: `color-${state}-border`,
      category: 'color',
      value: { light: c[`${hue}-400`], dark: c[`${hue}-700`] },
      description: `Borde de ${stateLabel[state]}.`,
    }),
  ]
})

export const colorTokens: readonly SemanticToken[] = [
  colorBg,
  colorSurface,
  colorSurfaceRaised,
  colorSurfaceSunken,
  colorSurfaceOverlay,
  colorSurfaceInverse,
  ...colorText,
  ...colorBorder,
  ...colorAccent,
  ...colorStates,
]
