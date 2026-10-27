import type { DocGroup } from '../docs/types.ts'
import type { FoundationCategory } from '../router.ts'

/** Texts of the catalog itself. It is an internal tool, so it is exempt from the glossary test (research R10). */
export const catalog = {
  title: 'Design system',
  skipToContent: 'Saltar al contenido',
  menu: { open: 'Abrir menú', close: 'Cerrar menú' },
  nav: {
    label: 'Secciones del catálogo',
    home: 'Portada',
    foundations: 'Fundamentos',
    components: 'Componentes',
    sample: 'Página de muestra',
  },
  foundations: {
    color: 'Color',
    tipografia: 'Tipografía',
    espaciado: 'Espaciado',
    radios: 'Radios',
    elevacion: 'Elevación',
    cristal: 'Cristal',
    bordes: 'Bordes',
    capas: 'Capas',
    movimiento: 'Movimiento',
    'puntos-de-ruptura': 'Puntos de ruptura',
    iconos: 'Iconos',
  } satisfies Record<FoundationCategory, string>,
  groups: {
    actions: 'Acciones',
    forms: 'Formularios',
    containers: 'Contenedores',
    communication: 'Comunicación',
    progress: 'Progreso',
  } satisfies Record<DocGroup, string>,
  doc: {
    variants: 'Variantes',
    states: 'Estados',
    dos: 'Así sí',
    donts: 'Así no',
    a11y: 'Accesibilidad',
    tokens: 'Tokens que usa',
    themes: 'En los dos temas',
  },
  notFound: { title: 'Página no encontrada', back: 'Volver a la portada' },
} as const
