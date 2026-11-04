import { Semaphore } from '@ytcreator/ui'
import type { ComponentDoc } from './types.ts'

export const semaphoreDoc: ComponentDoc = {
  id: 'semaphore',
  name: 'Semaphore',
  summary: 'Semáforo con icono y texto para decir de un vistazo cómo está algo.',
  group: 'communication',
  variants: [
    { title: 'Verde', render: () => <Semaphore state="verde" /> },
    { title: 'Ámbar', render: () => <Semaphore state="ambar" /> },
    { title: 'Rojo', render: () => <Semaphore state="rojo" /> },
    { title: 'Sin comprobar', render: () => <Semaphore state="sin_comprobar" /> },
  ],
  states: [{ state: 'Con su propio texto', render: () => <Semaphore state="rojo">Esa @ ya está ocupada</Semaphore> }],
  dos: [{ text: 'Di qué significa aquí: «Libre», «Ocupado». Si no, usa el texto general.' }],
  donts: [{ text: 'No uses el verde cuando no se ha podido comprobar: para eso está «Sin comprobar».' }],
  a11y: [
    'Cada estado tiene su icono y su texto: el color nunca es la única pista.',
    'El icono es decorativo y el lector de pantalla lee el texto.',
  ],
  tokens: [
    'badge-bg',
    'badge-text',
    'badge-border',
    'badge-radius',
    'badge-height',
    'color-success-bg',
    'color-warning-bg',
    'color-danger-bg',
  ],
}
