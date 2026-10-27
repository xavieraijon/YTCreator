import { TextArea } from '@ytcreator/ui'
import type { ComponentDoc } from './types.ts'

export const textAreaDoc: ComponentDoc = {
  id: 'text-area',
  name: 'TextArea',
  summary: 'Campo de varias líneas para textos largos, como un guion o una descripción.',
  group: 'forms',
  variants: [
    {
      title: 'Fijo',
      render: () => (
        <TextArea label="Descripción del vídeo" description="Las dos primeras líneas se ven sin abrirla." />
      ),
    },
    { title: 'Crece con el texto', render: () => <TextArea label="Notas para el guion" rows={2} autoResize /> },
  ],
  states: [
    { state: 'Foco', render: () => <TextArea label="Descripción del vídeo" data-force-state="focus" /> },
    {
      state: 'Error',
      render: () => (
        <TextArea label="Descripción del vídeo" error="Escribe una descripción: ayuda a que encuentren el vídeo." />
      ),
    },
    { state: 'Desactivado', render: () => <TextArea label="Descripción del vídeo" disabled /> },
  ],
  dos: [{ text: 'Usa «Crece con el texto» cuando no sepas cuánto se escribirá.' }],
  donts: [{ text: 'No lo uses para datos de una sola línea, como un título.' }],
  a11y: [
    'Comparte etiqueta, ayuda y error con TextField.',
    'Donde el navegador no sabe crecer, el usuario puede estirarlo.',
  ],
  tokens: ['field-bg', 'field-border', 'field-text', 'field-error', 'field-radius', 'line-height-reading'],
}
