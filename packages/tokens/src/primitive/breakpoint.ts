import { primitives } from '../types.ts'

/** Not emitted as custom properties: exported as constants and as the linter allow-list (research R5). */
export const breakpoint = primitives('breakpoint', 'breakpoint', {
  sm: '40rem',
  md: '48rem',
  lg: '64rem',
  xl: '80rem',
})
