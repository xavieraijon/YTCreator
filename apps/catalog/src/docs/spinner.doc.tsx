import { Spinner } from '@ytcreator/ui'
import type { ComponentDoc } from './types.ts'

export const spinnerDoc: ComponentDoc = {
  id: 'spinner',
  name: 'Spinner',
  summary: 'Indica una espera corta, de pocos segundos, sin saber cuánto falta.',
  group: 'progress',
  variants: [
    { title: 'Con texto para lectores de pantalla', render: () => <Spinner label="Guardando el guion" /> },
    { title: 'Pequeño', render: () => <Spinner size="sm" label="Cargando" /> },
    { title: 'Grande', render: () => <Spinner size="lg" label="Cargando" /> },
  ],
  states: [],
  dos: [{ text: 'Úsalo para esperas cortas dentro de un botón o junto a un texto.' }],
  donts: [{ text: 'No lo uses en tareas largas de la IA: usa «La IA está trabajando», que dice qué pasa.' }],
  a11y: [
    'Con `label` es una región `status`: el lector anuncia el texto una vez.',
    'Sin `label` es decorativo (`aria-hidden`): el texto de al lado ya explica la espera.',
    'Con movimiento reducido no gira.',
  ],
  tokens: ['spinner-color', 'icon-size-md', 'duration-slow'],
}
