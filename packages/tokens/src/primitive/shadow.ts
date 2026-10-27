import { primitives } from '../types.ts'

/** Three elevations and two glows (accent and AI). Same value in both themes. */
export const shadow = primitives('shadow', 'shadow', {
  low: '0 1px 2px oklch(0 0 0 / 0.08), 0 1px 3px oklch(0 0 0 / 0.06)',
  mid: '0 2px 4px oklch(0 0 0 / 0.08), 0 8px 24px oklch(0 0 0 / 0.14)',
  high: '0 4px 12px oklch(0 0 0 / 0.12), 0 24px 56px oklch(0 0 0 / 0.28)',
  accent: '0 0 0 1px oklch(0.67 0.22 5 / 0.35), 0 6px 24px oklch(0.67 0.22 5 / 0.35)',
  ai: '0 0 0 1px oklch(0.62 0.21 293 / 0.35), 0 0 32px oklch(0.62 0.21 293 / 0.4)',
})
