import { Select } from '@ytcreator/ui'
import type { ComponentDoc } from './types.ts'

const languages = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'Inglés' },
  { value: 'pt', label: 'Portugués' },
  { value: 'fr', label: 'Francés' },
  { value: 'de', label: 'Alemán' },
  { value: 'it', label: 'Italiano', disabled: true },
]

const lengths = [
  { value: 'short', label: 'Corto', description: 'Menos de 5 minutos. Una sola idea, bien contada.' },
  { value: 'medium', label: 'Medio', description: 'De 5 a 12 minutos. Lo habitual en tutoriales.' },
  { value: 'long', label: 'Largo', description: 'Más de 12 minutos. Para ir a fondo.' },
]

export const selectDoc: ComponentDoc = {
  id: 'select',
  name: 'Select',
  summary: 'Desplegable propio para elegir una opción entre muchas, con el aspecto del resto del sistema.',
  group: 'forms',
  variants: [
    { title: 'Básica', render: () => <Select label="Idioma del vídeo" options={languages} defaultValue="es" /> },
    {
      title: 'Sin elegir (texto de ejemplo)',
      render: () => <Select label="Idioma del vídeo" options={languages} placeholder="Elige un idioma" />,
    },
    {
      title: 'Opciones con descripción',
      render: () => <Select label="Duración del vídeo" options={lengths} defaultValue="medium" />,
    },
  ],
  states: [
    {
      state: 'Foco',
      render: () => <Select label="Idioma del vídeo" options={languages} defaultValue="es" data-force-state="focus" />,
    },
    {
      state: 'Error',
      render: () => (
        <Select
          label="Idioma del vídeo"
          options={languages}
          placeholder="Elige un idioma"
          error="Elige el idioma en el que hablas en el vídeo."
        />
      ),
    },
    {
      state: 'Desactivado',
      render: () => <Select label="Idioma del vídeo" options={languages} defaultValue="es" disabled />,
    },
  ],
  dos: [
    { text: 'Úsala con más de cinco opciones; con menos, un RadioGroup las muestra todas.' },
    { text: 'Añade una descripción a las opciones cuando el nombre solo no basta para decidir.' },
  ],
  donts: [
    { text: 'No la uses para acciones: elegir una opción no debe hacer nada por sí solo.' },
    { text: 'No uses el texto de ejemplo como etiqueta: la etiqueta siempre está visible.' },
  ],
  a11y: [
    'Se abre con Enter, Espacio o las flechas; las flechas recorren, Enter elige y Escape cierra sin cambiar.',
    'Escribir las primeras letras salta a la opción que empieza así.',
    'El lector de pantalla la anuncia como lista desplegable con su etiqueta, ayuda y error, igual que TextField.',
    'Dentro de un formulario envía su valor como un campo nativo (`name`).',
  ],
  tokens: [
    'field-bg',
    'field-border',
    'field-radius',
    'select-menu-bg',
    'select-menu-border',
    'select-menu-shadow',
    'select-option-highlight',
    'select-option-check',
  ],
}
