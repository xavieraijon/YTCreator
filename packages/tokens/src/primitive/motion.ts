import { primitives } from '../types.ts'

export const duration = primitives('motion', 'duration', {
  0: '0ms',
  80: '80ms',
  150: '150ms',
  240: '240ms',
  400: '400ms',
  8000: '8s',
})

export const easing = primitives('motion', 'curve', {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  enter: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
  exit: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
})
