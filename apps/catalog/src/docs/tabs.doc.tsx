import { Tabs } from '@ytcreator/ui'
import demo from './demo.module.css'
import type { ComponentDoc } from './types.ts'

const items = [
  { id: 'script', label: 'Guion', content: <p>El texto completo de tu vídeo.</p> },
  { id: 'outline', label: 'Esquema', content: <p>Las partes del vídeo y su orden.</p> },
  { id: 'notes', label: 'Notas', content: <p>Ideas sueltas para la grabación.</p> },
]

const withDisabled = [
  { id: 'script', label: 'Guion', content: <p>El texto completo de tu vídeo.</p> },
  { id: 'notes', label: 'Notas', content: <p>Ideas sueltas.</p>, disabled: true },
]

const many = [
  'Resumen',
  'Guion',
  'Esquema',
  'Notas',
  'Título y descripción',
  'Miniatura',
  'Subtítulos',
  'Configuración',
].map((label, index) => ({ id: `section-${index}`, label, content: <p>{label}</p> }))

const longLabels = [
  { id: 'settings', label: 'Configuración', content: <p>Los ajustes del canal.</p> },
  { id: 'customize', label: 'Personalizar', content: <p>El aspecto de tus vídeos.</p> },
  { id: 'description', label: 'Título y descripción', content: <p>Lo que verá quien encuentre el vídeo.</p> },
]

export const tabsDoc: ComponentDoc = {
  id: 'tabs',
  name: 'Tabs',
  summary: 'Vistas distintas del mismo contenido, una a la vez.',
  group: 'containers',
  variants: [
    { title: 'Tres pestañas', render: () => <Tabs items={items} label="Partes del vídeo" /> },
    { title: 'Muchas pestañas (desplazamiento interno)', render: () => <Tabs items={many} label="Secciones" /> },
  ],
  states: [
    {
      state: 'Pestaña desactivada',
      render: () => <Tabs items={withDisabled} label="Partes con una desactivada" />,
    },
    {
      state: 'Texto largo en poco espacio (desplazamiento interno)',
      render: () => (
        <div className={demo.narrowPanel}>
          <Tabs items={longLabels} label="Ajustes" />
        </div>
      ),
    },
  ],
  dos: [{ text: 'Usa pestañas para vistas del mismo elemento, con etiquetas de una o dos palabras.' }],
  donts: [{ text: 'No las uses para pasos de un flujo: para eso está el Stepper.' }],
  a11y: [
    'Las flechas mueven y eligen; Inicio y Fin van a la primera y a la última.',
    'Tab entra en la pestaña elegida y luego salta a su contenido.',
    'Si hay varias listas en la página, cada una lleva su `label`.',
  ],
  tokens: ['tabs-border', 'tabs-indicator', 'color-text-secondary', 'control-height-md'],
}
