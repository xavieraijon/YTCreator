// Texts of the publishing package (specs/006-publishing-package/contracts/ui-screens.md).
export const publishEs = {
  // Said for people, not as the name of a state (decision 18).
  status: {
    sin_empezar: 'Por empezar',
    portada_borrador: 'Título y miniatura en borrador',
    portada_aprobada: 'Título y miniatura aprobados',
    textos_borrador: 'Descripción en borrador',
    textos_aprobados: 'Descripción aprobada',
    aprobado: 'Publicación aprobada',
  },
  // A Short has no thumbnail: its first step is the title and the cover.
  statusShort: {
    portada_borrador: 'Título y portada en borrador',
    portada_aprobada: 'Título y portada aprobados',
  },
  list: {
    title: 'Mis publicaciones',
    why: 'Aquí tienes lo que vas a copiar en YouTube al subir cada vídeo.',
    open: 'Abrir',
    openNamed: 'Abrir la publicación de «{titulo}»',
    updated: 'Último cambio: {date}',
    channelLink: 'Mis publicaciones',
    emptyTitle: 'Todavía no has preparado ninguna publicación',
    emptyBody:
      'La publicación sale de un guion aprobado. Abre uno de tus guiones aprobados y pulsa «Preparar la publicación»; si aún no tienes ninguno, primero aprueba un guion.',
    toScripts: 'Ir a mis guiones',
    backToChannel: 'Volver al canal',
  },
  screen: {
    progress: 'Progreso de la publicación',
    steps: {
      portada: 'Título y miniatura',
      portadaShort: 'Título y portada',
      textos: 'Descripción',
      revisar: 'Revisar y copiar',
    },
    why: {
      portada: 'La gente ve el título y la miniatura juntos, y en un segundo decide si pulsa.',
      textos:
        'Las dos primeras líneas son lo único que se ve sin pulsar «más»: di de qué va el vídeo con las palabras que busca la gente.',
      revisar: 'Copia cada parte en YouTube Studio en este orden. Lo que YouTube no acepta te lo avisamos antes.',
    },
    back: 'Volver a mis publicaciones',
  },
} as const
