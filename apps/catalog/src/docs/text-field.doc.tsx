import { TextField } from '@ytcreator/ui'
import { Search } from 'lucide-react'
import demo from './demo.module.css'
import type { ComponentDoc } from './types.ts'

export const textFieldDoc: ComponentDoc = {
  id: 'text-field',
  name: 'TextField',
  summary: 'Campo de una línea con etiqueta siempre visible, ayuda y error.',
  group: 'forms',
  variants: [
    {
      title: 'Con ayuda',
      render: () => (
        <TextField label="Título del vídeo" description="Entre 40 y 70 caracteres se leen enteros en el móvil." />
      ),
    },
    { title: 'Opcional', render: () => <TextField label="Subtítulo" optional /> },
    { title: 'Con icono', render: () => <TextField label="Buscar ideas" type="search" iconStart={Search} /> },
  ],
  states: [
    { state: 'Encima', render: () => <TextField label="Título del vídeo" data-force-state="hover" /> },
    { state: 'Foco', render: () => <TextField label="Título del vídeo" data-force-state="focus" /> },
    {
      state: 'Error',
      render: () => (
        <TextField
          label="Título del vídeo"
          defaultValue="Vídeo"
          error="El título es demasiado corto: escribe al menos 10 caracteres."
        />
      ),
    },
    {
      state: 'Desactivado',
      render: () => <TextField label="Título del vídeo" defaultValue="Mi primer vídeo" disabled />,
    },
    {
      state: 'Texto largo',
      render: () => (
        <div className={demo.narrow}>
          <TextField label="Nombre del canal de YouTube" defaultValue="Cocina fácil para estudiantes sin horno" />
        </div>
      ),
    },
  ],
  dos: [{ text: 'Di en el error qué ha fallado y cómo arreglarlo.' }],
  donts: [{ text: 'No uses el texto de ejemplo (placeholder) como etiqueta: desaparece al escribir.' }],
  a11y: [
    'La etiqueta está unida al campo con for/id.',
    'La ayuda y el error se leen con aria-describedby; el error marca aria-invalid.',
    'El error lleva icono y texto, no solo color.',
  ],
  tokens: [
    'field-bg',
    'field-border',
    'field-border-hover',
    'field-text',
    'field-label',
    'field-description',
    'field-error',
    'field-radius',
    'field-padding-inline',
  ],
}
