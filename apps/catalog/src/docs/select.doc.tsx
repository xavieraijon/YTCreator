import { Select } from '@ytcreator/ui'
import type { ComponentDoc } from './types.ts'

const languages = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'Inglés' },
  { value: 'pt', label: 'Portugués' },
]

export const selectDoc: ComponentDoc = {
  id: 'select',
  name: 'Select',
  summary: 'Lista desplegable nativa para elegir una opción entre muchas.',
  group: 'forms',
  variants: [{ title: 'Básica', render: () => <Select label="Idioma del vídeo" options={languages} /> }],
  states: [
    { state: 'Foco', render: () => <Select label="Idioma del vídeo" options={languages} data-force-state="focus" /> },
    {
      state: 'Error',
      render: () => (
        <Select label="Idioma del vídeo" options={languages} error="Elige el idioma en el que hablas en el vídeo." />
      ),
    },
    { state: 'Desactivado', render: () => <Select label="Idioma del vídeo" options={languages} disabled /> },
  ],
  dos: [{ text: 'Úsala con más de cinco opciones; con menos, un RadioGroup las muestra todas.' }],
  donts: [{ text: 'No la uses para acciones: elegir una opción no debe hacer nada por sí solo.' }],
  a11y: [
    'Es un <select> nativo: teclado y lector de pantalla del sistema.',
    'Comparte etiqueta, ayuda y error con TextField.',
  ],
  tokens: ['field-bg', 'field-border', 'field-text', 'field-radius', 'field-padding-inline'],
}
