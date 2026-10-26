import type { UiStrings } from './types.ts'

/** Default catalog. Plain words: no technical jargon (principle I, glossary test). */
export const es: UiStrings = {
  button: {
    loading: 'Cargando…',
  },
  dialog: {
    close: 'Cerrar',
  },
  toast: {
    close: 'Cerrar aviso',
    region: 'Avisos ({hotkey})',
  },
  field: {
    optional: 'opcional',
    errorPrefix: 'Error:',
  },
  progress: {
    value: '{value} %',
  },
  stepper: {
    position: 'Paso {current} de {total}',
    done: 'completado',
    current: 'paso actual',
    pending: 'pendiente',
  },
  theme: {
    label: 'Tema',
    auto: 'Automático',
    light: 'Claro',
    dark: 'Oscuro',
  },
  aiWorking: {
    defaultLabel: 'La IA está trabajando…',
  },
}
