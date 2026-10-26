import { primitives } from '../types.ts'

/** Glass (research R9): alpha ≥ 0.72, blur with extra saturation and a 1 px inner highlight. */
export const glass = primitives('glass', 'glass', {
  'bg-light': 'oklch(1 0 0 / 0.78)',
  'bg-dark': 'oklch(0.22 0.007 285 / 0.78)',
  'border-light': 'oklch(1 0 0 / 0.6)',
  'border-dark': 'oklch(1 0 0 / 0.1)',
  'highlight-light': 'oklch(1 0 0 / 0.7)',
  'highlight-dark': 'oklch(1 0 0 / 0.08)',
  'blur-20': 'blur(20px) saturate(140%)',
  'blur-off': 'none',
})
