/** Texts of the sample page. Unlike the rest of the catalog they imitate the product, so they pass the glossary. */
export const sample = {
  steps: [
    { id: 'channel', label: 'Tu canal' },
    { id: 'idea', label: 'La idea' },
    { id: 'approach', label: 'El enfoque' },
    { id: 'script', label: 'El guion' },
    { id: 'package', label: 'Publicar' },
  ],
  title: 'Elige el enfoque de tu vídeo',
  why: 'El enfoque decide qué promete el vídeo en los primeros segundos. Con él claro, el guion y el título salen solos.',
  approachLabel: 'Enfoque',
  approaches: [
    {
      value: 'tutorial',
      label: 'Tutorial paso a paso',
      description: 'Enseñas a hacer algo concreto, de principio a fin.',
    },
    {
      value: 'story',
      label: 'Historia personal',
      description: 'Cuentas lo que te pasó y lo que aprendiste por el camino.',
    },
    {
      value: 'list',
      label: 'Lista de consejos',
      description: 'Reúnes los mejores trucos en un formato fácil de seguir.',
    },
  ],
  audience: {
    label: '¿A quién va dirigido?',
    placeholder: 'Por ejemplo: gente que empieza a correr',
    description: 'Cuanto más concreto, mejor encaja la propuesta. Si lo dejas vacío, se piensa para todo el mundo.',
  },
  expert: {
    summary: 'Modo experto',
    lengthLabel: 'Duración del vídeo',
    lengths: [
      { value: 'short', label: 'Corto (menos de 5 min)' },
      { value: 'medium', label: 'Medio (de 5 a 12 min)' },
      { value: 'long', label: 'Largo (más de 12 min)' },
    ],
    hookLabel: 'Empezar con una pregunta',
    hookDescription: 'La primera frase del vídeo plantea una duda al espectador.',
  },
  generate: 'Generar propuesta',
  working: 'Preparando la propuesta de tu vídeo…',
  proposal: {
    heading: 'Tu propuesta',
    titleLabel: 'Título',
    title: 'Cómo empezar a correr sin lesionarte: el plan de 4 semanas',
    hookLabel: 'Primera frase',
    hookQuestion: '¿Y si el problema no fueran tus piernas, sino tu plan?',
    hookStatement: 'Casi todas las lesiones al empezar a correr vienen del plan, no de las piernas.',
    again: 'Probar otra propuesta',
    againHint: 'Si pruebas otra, la nueva sustituye a esta y se pierden tus cambios.',
  },
  next: 'Seguir al guion',
  nextToast: { title: 'Fin de la muestra', description: 'En la aplicación, aquí empezarías a escribir el guion.' },
  toast: { title: 'Propuesta lista', description: 'Puedes editarla antes de pasar al guion.' },
  assistant: 'Pedir ayuda al asistente',
} as const
