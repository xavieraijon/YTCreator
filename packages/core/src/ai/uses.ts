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
  'perfil_parte',
  'ideas',
  'otro_enfoque',
  'busquedas_idea',
  // The script (005).
  'escaleta',
  'guion',
  'guion_short',
  'bloque_guion',
] as const
export type AiUse = (typeof AI_USES)[number]
