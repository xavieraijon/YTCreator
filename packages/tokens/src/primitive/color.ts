import { primitives } from '../types.ts'

/**
 * Palette in OKLCH (research.md R2). Changing the brand accent means editing this file only.
 * The `*-100`, `*-800`, `*-900` and `*-950` tints extend R2 for subtle backgrounds and pressed states.
 */
export const color = primitives('color', 'color', {
  white: 'oklch(1 0 0)',
  black: 'oklch(0 0 0)',

  'neutral-0': 'oklch(1 0 0)',
  'neutral-50': 'oklch(0.985 0.002 285)',
  'neutral-100': 'oklch(0.965 0.003 285)',
  'neutral-200': 'oklch(0.92 0.004 285)',
  'neutral-300': 'oklch(0.87 0.005 285)',
  'neutral-400': 'oklch(0.71 0.01 285)',
  'neutral-500': 'oklch(0.55 0.012 285)',
  'neutral-600': 'oklch(0.44 0.012 285)',
  'neutral-700': 'oklch(0.37 0.01 285)',
  'neutral-800': 'oklch(0.27 0.008 285)',
  'neutral-850': 'oklch(0.22 0.007 285)',
  'neutral-900': 'oklch(0.18 0.006 285)',
  'neutral-950': 'oklch(0.145 0.005 285)',

  'coral-100': 'oklch(0.95 0.025 5)',
  'coral-300': 'oklch(0.81 0.11 10)',
  'coral-400': 'oklch(0.74 0.17 8)',
  'coral-500': 'oklch(0.67 0.22 5)',
  'coral-600': 'oklch(0.58 0.22 5)',
  'coral-700': 'oklch(0.50 0.19 5)',
  'coral-800': 'oklch(0.44 0.17 5)',
  'coral-900': 'oklch(0.28 0.08 5)',

  'violet-400': 'oklch(0.70 0.16 295)',
  'violet-500': 'oklch(0.62 0.21 293)',
  'violet-600': 'oklch(0.54 0.23 292)',

  'green-100': 'oklch(0.96 0.035 150)',
  'green-400': 'oklch(0.78 0.17 150)',
  'green-700': 'oklch(0.50 0.13 150)',
  'green-950': 'oklch(0.25 0.05 150)',
  'amber-100': 'oklch(0.97 0.04 85)',
  'amber-400': 'oklch(0.83 0.16 80)',
  'amber-700': 'oklch(0.55 0.13 65)',
  'amber-950': 'oklch(0.26 0.05 65)',
  'red-100': 'oklch(0.95 0.025 25)',
  'red-400': 'oklch(0.72 0.17 25)',
  'red-700': 'oklch(0.52 0.19 27)',
  'red-950': 'oklch(0.25 0.06 25)',
  'blue-100': 'oklch(0.95 0.025 245)',
  'blue-400': 'oklch(0.74 0.13 245)',
  'blue-700': 'oklch(0.50 0.15 255)',
  'blue-950': 'oklch(0.25 0.05 255)',

  'scrim-light': 'oklch(0.145 0.005 285 / 0.4)',
  'scrim-dark': 'oklch(0 0 0 / 0.6)',
})

export const gradient = primitives('color', 'color-gradient', {
  brand: 'linear-gradient(135deg in oklch, var(--p-color-coral-500), var(--p-color-violet-500))',
  ai: 'linear-gradient(135deg in oklch, var(--p-color-violet-500), var(--p-color-blue-400), var(--p-color-coral-500))',
})
