import { Card } from '@ytcreator/ui'
import demo from './demo.module.css'
import type { ComponentDoc } from './types.ts'

function IdeaCard({ forced }: { readonly forced?: 'hover' | 'focus' | 'active' }) {
  return (
    <Card interactive data-force-state={forced}>
      <a href="#/componentes/card">Cinco errores al editar tu primer vídeo</a>
      <p className={demo.muted}>Idea guardada hace 2 días</p>
    </Card>
  )
}

export const cardDoc: ComponentDoc = {
  id: 'card',
  name: 'Card',
  summary: 'Superficie sólida que agrupa el contenido de un elemento: una idea, un vídeo, un guion.',
  group: 'containers',
  variants: [
    {
      title: 'Estática',
      render: () => (
        <Card>
          <strong>Resumen del canal</strong>
          <p className={demo.muted}>12 ideas, 3 guiones en curso</p>
        </Card>
      ),
    },
    { title: 'Interactiva', render: () => <IdeaCard /> },
  ],
  states: [
    { state: 'Encima', render: () => <IdeaCard forced="hover" /> },
    { state: 'Foco', render: () => <IdeaCard forced="focus" /> },
    { state: 'Pulsada', render: () => <IdeaCard forced="active" /> },
  ],
  dos: [{ text: 'En una tarjeta interactiva, pon un solo enlace o botón: toda la tarjeta lo activa.' }],
  donts: [
    { text: 'No uses cristal en una tarjeta: el cristal es solo para capas flotantes.' },
    { text: 'No metas varios enlaces en una tarjeta interactiva.' },
  ],
  a11y: [
    'El nombre accesible es el del enlace o botón de dentro, no toda la tarjeta.',
    'El foco del enlace se dibuja alrededor de la tarjeta entera.',
  ],
  tokens: [
    'card-bg',
    'card-border',
    'card-border-hover',
    'card-shadow',
    'card-shadow-hover',
    'card-radius',
    'card-padding',
  ],
}
