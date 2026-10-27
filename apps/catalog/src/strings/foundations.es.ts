/** Texts of the foundation pages and the home page. Catalog content, exempt from the glossary test (research R10). */
export const foundations = {
  themes: { light: 'Claro', dark: 'Oscuro' },
  table: {
    sample: 'Muestra',
    token: 'Token',
    usage: 'Uso',
    primitive: 'Primitivo',
    value: 'Valor',
  },
  home: {
    lead: 'El design system de YTCreator: la base sobria y oscura que da calma, y la chispa (acento, degradados, brillos y cristal) que señala lo que está vivo. Todo lo que ves en la app sale de aquí.',
    levelsTitle: 'Tres niveles de token',
    levels: [
      {
        name: 'Primitivo',
        prefix: '--p-*',
        text: 'Valores en bruto: la paleta, la escala de tamaños, las curvas. No dicen para qué sirven, solo cuánto valen.',
        example: '--p-color-coral-500',
        who: 'Solo el paquete de tokens. Nunca se escriben en un componente ni en una pantalla.',
      },
      {
        name: 'Semántico',
        prefix: '--s-*',
        text: 'Un uso con nombre: «fondo», «texto secundario», «acento». Apuntan a un primitivo y cambian con el tema.',
        example: '--s-color-accent',
        who: 'Componentes y pantallas. Es el nivel que usas por defecto en cualquier estilo.',
      },
      {
        name: 'Componente',
        prefix: '--c-*',
        text: 'Las decisiones propias de un componente, siempre apuntando a semánticos.',
        example: '--c-button-primary-bg',
        who: 'Su componente y las pantallas que lo ajustan. Se crea cuando un componente necesita algo que ningún semántico expresa.',
      },
    ],
    exampleLabel: 'Ejemplo',
    whoLabel: 'Quién lo usa',
    missingTitle: 'Si falta un token',
    missing: [
      'No escribas el valor suelto ni tires de un primitivo: stylelint lo rechaza y el tema oscuro dejaría de funcionar.',
      'Busca primero un semántico que exprese el uso; casi siempre existe con otro nombre.',
      'Si el uso es nuevo, añade el semántico en el paquete de tokens, apuntando a un primitivo, con valor para los dos temas.',
      'Si solo lo necesita un componente, crea un token de componente que apunte a un semántico.',
    ],
    restraintTitle: 'La regla de la mesura',
    restraint: [
      'El cristal y los brillos aparecen solo donde aportan jerarquía o indican actividad: paneles flotantes, el asistente, los diálogos y el momento en que la IA genera.',
      'Nunca en superficies de lectura larga, como guiones o descripciones.',
      'Ante la duda, gana la legibilidad.',
    ],
    foundationsTitle: 'Fundamentos',
  },
  color: {
    lead: 'Cada color semántico, con su muestra en los dos temas a la vez, el primitivo del que sale y su uso.',
    groups: {
      surfaces: 'Fondos y superficies',
      text: 'Texto',
      border: 'Bordes',
      accent: 'Acento y degradados',
      status: 'Estados',
    },
    contrastTitle: 'Pares de contraste',
    contrastLead:
      'Combinaciones de texto o icono sobre fondo, con su ratio calculado en cada tema. Solo se pueden usar las que cumplen el mínimo en los dos.',
    contrast: {
      sample: 'Muestra',
      foreground: 'Texto o icono',
      background: 'Fondo',
      kind: 'Tipo',
      light: 'Ratio en claro',
      dark: 'Ratio en oscuro',
      allowed: '¿Cumple?',
      yes: 'Sí',
      no: 'No',
      kinds: { text: 'Texto (4,5:1)', 'large-text': 'Texto grande (3:1)', ui: 'Interfaz (3:1)' },
    },
  },
  typography: {
    lead: 'Geist para la interfaz y Geist Mono para código y datos. Interlineado amplio para leer y ajustado en titulares.',
    sample: 'El niño guionista añadió una canción a su vídeo de otoño.',
    sampleMono: 'duración: 08:42 · año: 2026',
    paragraph:
      'Un guion se lee de corrido. Por eso el interlineado de lectura deja aire entre líneas: el ojo encuentra la siguiente sin esfuerzo, incluso después de una pausa larga o de una frase con tildes, eñes y signos de interrogación.',
    families: 'Familias',
    sizes: 'Tamaños',
    weights: 'Pesos',
    lineHeights: 'Interlineados',
    letterSpacing: 'Ajuste entre letras',
  },
  spacing: {
    lead: 'Escala de espacio en múltiplos de 4 px. Úsala para márgenes, rellenos y huecos; las medidas de control fijan alturas y áreas de toque.',
    scale: 'Escala',
    controls: 'Controles, iconos y áreas de toque',
  },
  radius: {
    lead: 'Cuanto más grande es la superficie, más redondeada. La píldora queda para insignias, avatares y grupos segmentados.',
  },
  borders: {
    lead: 'Bordes finos para separar y uno marcado para lo seleccionado. El anillo de foco siempre es visible y separado del control.',
    focusDemo: 'Control con foco',
  },
  elevation: {
    lead: 'Tres niveles de sombra para separar planos, y dos brillos que se reservan para la acción principal y la IA.',
  },
  glass: {
    lead: 'Superficies translúcidas con el fondo desenfocado. Con transparencia reducida pasan a ser sólidas.',
    demoTitle: 'Panel flotante',
    demoText: 'El texto sobre cristal mantiene el mismo contraste que sobre una superficie sólida.',
    restraintTitle: 'La regla de la mesura',
    allowedTitle: 'Dónde sí',
    allowed: ['Paneles flotantes', 'Diálogos', 'El asistente', 'La firma de la IA mientras trabaja'],
    forbiddenTitle: 'Dónde nunca',
    forbidden: ['Guiones, descripciones y cualquier lectura larga', 'Tablas y formularios largos'],
    doubt: 'Ante la duda, gana la legibilidad: usa una superficie sólida.',
  },
  layers: {
    lead: 'El orden en que se apilan las capas, de abajo arriba. Usa siempre el nombre, nunca un número suelto.',
  },
  motion: {
    lead: 'Movimientos cortos y con propósito. Con movimiento reducido se quitan los desplazamientos y solo quedan fundidos breves.',
    durations: 'Duraciones',
    curves: 'Curvas',
    aiDemo: 'La IA está trabajando: la aurora gira despacio y se queda quieta con movimiento reducido.',
    play: 'Reproducir',
  },
  breakpoints: {
    lead: 'Diseño desde móvil (375 px) hacia arriba. Antes de añadir un punto de ruptura, prueba con un diseño intrínseco o una consulta de contenedor.',
    name: 'Nombre',
    value: 'Desde',
    notesTitle: 'Cómo usarlos',
    notes: [
      'Las propiedades personalizadas no funcionan dentro de @media: escribe el valor literal en una consulta de rango, por ejemplo @media (width >= 48rem).',
      'Stylelint solo admite los valores de esta tabla, que salen de @ytcreator/tokens/breakpoints.',
      'Prefiere @container y rejillas con minmax() cuando el componente depende de su propio ancho y no del de la ventana.',
    ],
  },
  icons: {
    lead: 'Iconos de Lucide con trazo de 1,75. Tres tamaños, ligados a los tokens de tamaño de icono.',
    sizes: 'Tamaños',
    decorativeTitle: 'Decorativo o con nombre',
    decorative:
      'Si el icono acompaña a un texto que ya dice lo mismo, es decorativo: no le pongas label y queda oculto a los lectores de pantalla.',
    labelled:
      'Si el icono va solo (un botón de icono, un estado), necesita label: es lo que oye quien usa un lector de pantalla.',
    gallery: 'Galería',
  },
} as const
