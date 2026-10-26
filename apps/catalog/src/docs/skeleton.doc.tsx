import { Skeleton } from '@ytcreator/ui'
import demo from './demo.module.css'
import type { ComponentDoc } from './types.ts'

export const skeletonDoc: ComponentDoc = {
  id: 'skeleton',
  name: 'Skeleton',
  summary: 'Hueco con la forma del contenido mientras se carga.',
  group: 'progress',
  variants: [
    {
      title: 'Texto de tres líneas',
      render: () => (
        <div aria-busy="true" className={demo.column}>
          <Skeleton lines={3} />
        </div>
      ),
    },
    {
      title: 'Miniatura y avatar',
      render: () => (
        <div aria-busy="true" className={demo.column}>
          <Skeleton shape="rect" />
          <Skeleton shape="circle" />
        </div>
      ),
    },
  ],
  states: [],
  dos: [{ text: 'Imita la forma real del contenido para que la página no salte al cargar.' }],
  donts: [{ text: 'No lo uses para tareas largas de la IA: no dice qué está pasando.' }],
  a11y: [
    'Es invisible para el lector de pantalla: el contenedor lleva `aria-busy="true"` mientras carga.',
    'Con movimiento reducido no late.',
  ],
  tokens: ['skeleton-bg', 'radius-sm', 'duration-slow'],
}
