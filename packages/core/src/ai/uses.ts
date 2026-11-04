// Grows with each feature that calls the AI; every use has its own profile per provider.
export const AI_USES = [
  'comprobacion',
  'preguntas',
  'nichos',
  'recomendacion',
  'conceptos',
  'nombres',
  'lectura_canal',
  'posicionamiento',
] as const
export type AiUse = (typeof AI_USES)[number]
