// Versioned prompts. Each one is imported as text (`?raw`) so the server bundle embeds it.
import comprobacionV1 from '../prompts/comprobacion/v1.md?raw'

export interface Prompt {
  id: string
  version: number
  text: string
}

// Minimal connection check: a one-word answer keeps the cost at the floor (research R12).
export const COMPROBACION: Prompt = { id: 'comprobacion', version: 1, text: comprobacionV1.trim() }
