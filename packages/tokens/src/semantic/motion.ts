import { duration, easing } from '../primitive/motion.ts'
import { semantic, type SemanticToken } from '../types.ts'

/** With `prefers-reduced-motion: reduce` every duration drops to 0 except `duration-fast`, kept for opacity fades. */
export const motionTokens: readonly SemanticToken[] = [
  semantic({
    name: 'duration-instant',
    category: 'motion',
    value: duration[80],
    description: 'Respuesta inmediata: pulsación y cambios de color.',
    reducedMotion: duration[0],
  }),
  semantic({
    name: 'duration-fast',
    category: 'motion',
    value: duration[150],
    description: 'Transiciones cortas. Se mantiene con movimiento reducido, solo para opacidades.',
  }),
  semantic({
    name: 'duration-normal',
    category: 'motion',
    value: duration[240],
    description: 'Entradas y salidas de menús y popovers.',
    reducedMotion: duration[0],
  }),
  semantic({
    name: 'duration-slow',
    category: 'motion',
    value: duration[400],
    description: 'Diálogos y cambios de disposición.',
    reducedMotion: duration[0],
  }),
  semantic({
    name: 'duration-ai-cycle',
    category: 'motion',
    value: duration[3000],
    description: 'Una vuelta de la animación de la IA trabajando: lo bastante rápida para notarse en una espera corta.',
    reducedMotion: duration[0],
  }),
  semantic({ name: 'easing-standard', category: 'motion', value: easing.standard, description: 'Curva por defecto.' }),
  semantic({
    name: 'easing-enter',
    category: 'motion',
    value: easing.enter,
    description: 'Curva de elementos que aparecen.',
  }),
  semantic({
    name: 'easing-exit',
    category: 'motion',
    value: easing.exit,
    description: 'Curva de elementos que desaparecen.',
  }),
]
