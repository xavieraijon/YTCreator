import { AiWorking } from '@ytcreator/ui'
import demo from './demo.module.css'
import type { ComponentDoc } from './types.ts'

export const aiWorkingDoc: ComponentDoc = {
  id: 'ai-working',
  name: 'AiWorking',
  summary: 'La firma de la IA trabajando: una aurora en movimiento alrededor de un texto que dice qué está haciendo.',
  group: 'progress',
  variants: [
    { title: 'En línea', render: () => <AiWorking label="Escribiendo tu guion…" /> },
    {
      title: 'Panel',
      render: () => (
        <div className={demo.column}>
          <AiWorking variant="panel" label="Buscando ideas para tu nicho…" />
        </div>
      ),
    },
    {
      title: 'Con progreso',
      render: () => (
        <div className={demo.column}>
          <AiWorking variant="panel" label="Generando subtítulos" progress={45} />
        </div>
      ),
    },
  ],
  states: [
    {
      state: 'Texto largo',
      render: () => (
        <div className={demo.column}>
          <AiWorking label="Revisando el guion completo para proponer un título, una descripción y las etiquetas…" />
        </div>
      ),
    },
  ],
  dos: [
    { text: 'Di siempre qué hace la IA con un verbo concreto: «Escribiendo tu guion…».' },
    { text: 'Pásale `progress` cuando la tarea sepa cuánto le falta.' },
  ],
  donts: [
    { text: 'No lo uses para esperas cortas que no son de la IA: usa Spinner.' },
    { text: 'No pongas más de uno a la vez en la misma pantalla.' },
  ],
  a11y: [
    'Es una región `status`: el lector anuncia el texto sin mover el foco.',
    'El texto es visible, no solo para lectores de pantalla.',
    'Con movimiento reducido la aurora queda quieta; tras una espera larga se atenúa.',
  ],
  tokens: [
    'ai-working-aurora',
    'ai-working-cycle',
    'ai-working-bg',
    'ai-working-text',
    'ai-working-radius',
    'duration-slow',
  ],
}
