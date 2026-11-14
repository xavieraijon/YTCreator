export * from './market.ts'
export * from './prompts.ts'
import { promptFor } from './prompts.ts'

export const COMPROBACION = promptFor('comprobacion')
export const WEB_STRUCTURE_STEP = promptFor('paso_estructurado_web').body
export const WEB_LIMITS_NOTE = promptFor('limite_busqueda').body
export * from './script.ts'
export * from './publish.ts'
export * from './subtitles.ts'
