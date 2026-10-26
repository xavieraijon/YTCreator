import { Badge } from '@ytcreator/ui'
import demo from './demo.module.css'
import type { ComponentDoc } from './types.ts'

export const badgeDoc: ComponentDoc = {
  id: 'badge',
  name: 'Badge',
  summary: 'Etiqueta corta de estado o de categoría.',
  group: 'communication',
  variants: [
    { title: 'Neutro', render: () => <Badge>Borrador</Badge> },
    { title: 'Acento', render: () => <Badge tone="accent">Nuevo</Badge> },
    { title: 'Éxito', render: () => <Badge tone="success">Publicado</Badge> },
    { title: 'Aviso', render: () => <Badge tone="warning">Pendiente de revisar</Badge> },
    { title: 'Peligro', render: () => <Badge tone="danger">Con errores</Badge> },
    { title: 'Información', render: () => <Badge tone="info">Programado</Badge> },
  ],
  states: [
    {
      state: 'Texto largo recortado',
      render: () => (
        <div className={demo.narrow}>
          <Badge tone="info">Programado para el martes a las nueve</Badge>
        </div>
      ),
    },
  ],
  dos: [{ text: 'Una o dos palabras que dicen el estado: «Publicado», «Borrador».' }],
  donts: [{ text: 'No pongas frases ni acciones: una etiqueta no se pulsa.' }],
  a11y: [
    'El tono nunca es la única pista: el texto dice el estado.',
    'Un texto largo se recorta con elipsis y queda entero en `title` y para el lector de pantalla.',
  ],
  tokens: [
    'badge-bg',
    'badge-text',
    'badge-border',
    'badge-radius',
    'badge-height',
    'color-success-bg',
    'color-success-fg',
  ],
}
