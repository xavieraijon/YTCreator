import { primitives } from '../types.ts'

export const fontFamily = primitives('type', 'font-family', {
  geist: "'Geist Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  'geist-mono': "'Geist Mono Variable', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
})

/** Named by pixel size, emitted in rem. */
export const fontSize = primitives('type', 'font-size', {
  12: '0.75rem',
  14: '0.875rem',
  16: '1rem',
  18: '1.125rem',
  20: '1.25rem',
  24: '1.5rem',
  30: '1.875rem',
  36: '2.25rem',
  48: '3rem',
})

export const fontWeight = primitives('type', 'font-weight', {
  400: '400',
  500: '500',
  600: '600',
})

export const lineHeight = primitives('type', 'line-height', {
  115: '1.15',
  145: '1.45',
  160: '1.6',
})

export const letterSpacing = primitives('type', 'letter-spacing', {
  condensed: '-0.02em',
})
