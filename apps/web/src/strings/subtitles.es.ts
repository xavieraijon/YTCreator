// Texts of the subtitles (specs/007-subtitles/contracts/ui-screens.md).
export const subtitlesEs = {
  screen: {
    title: 'Subtítulos',
    why: 'Mucha gente ve los vídeos sin sonido: con subtítulos se entera de todo y se queda más.',
    loading: 'Cargando los subtítulos…',
    of: 'Del vídeo «{titulo}»',
    toScript: 'Volver al guion',
  },
  // The state of the subtitles of a script (data-model.md, «Estados»).
  status: {
    sin_hacer: 'Sin hacer',
    en_marcha: 'En marcha',
    borrador: 'Borrador',
    aprobados: 'Aprobados',
  },
} as const
