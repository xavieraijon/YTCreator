import { EmptyState } from '@ytcreator/ui'
import { Lightbulb, SearchX } from 'lucide-react'
import type { ComponentDoc } from './types.ts'

export const emptyStateDoc: ComponentDoc = {
  id: 'empty-state',
  name: 'EmptyState',
  summary: 'Explica por qué un lugar está vacío y cuál es el siguiente paso.',
  group: 'communication',
  variants: [
    {
      title: 'Con acción',
      render: () => (
        <EmptyState
          icon={Lightbulb}
          title="Todavía no tienes ideas"
          description="Apunta temas que te gustaría tratar; la IA te ayudará a convertirlos en vídeos."
          action={{ label: 'Añadir la primera idea', onClick: () => undefined }}
        />
      ),
    },
    {
      title: 'Sin resultados',
      render: () => (
        <EmptyState
          icon={SearchX}
          title="Ninguna idea coincide"
          description="Prueba con otra palabra o quita filtros."
        />
      ),
    },
  ],
  states: [],
  dos: [{ text: 'Di qué se verá aquí y cómo conseguirlo.' }],
  donts: [{ text: 'No dejes un «No hay datos» sin más.' }],
  a11y: [
    'El nivel del título se elige para no romper el esquema de la página.',
    'El icono es decorativo: el título ya lo dice todo.',
  ],
  tokens: [
    'empty-state-icon',
    'empty-state-icon-bg',
    'empty-state-border',
    'empty-state-padding',
    'empty-state-radius',
  ],
}
