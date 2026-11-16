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
  'enfoques_short',
  'investigacion',
  'comprobar_guion',
  // The publishing package (006).
  'titulos',
  'miniaturas',
  'descripcion',
  'parte_paquete',
  'paquete_short',
  // The subtitles (007).
  'revision_subtitulos',
] as const
export type AiUse = (typeof AI_USES)[number]
