import { Button, IconButton, Tooltip } from '@ytcreator/ui'
import { Share2 } from 'lucide-react'
import demo from './demo.module.css'
import type { ComponentDoc } from './types.ts'

export const tooltipDoc: ComponentDoc = {
  id: 'tooltip',
  name: 'Tooltip',
  summary: 'Ayuda breve que sale al pasar el puntero o al enfocar un control. Nunca guarda información esencial.',
  group: 'communication',
  variants: [
    {
      title: 'Sobre un botón',
      render: () => (
        <Tooltip content="También con Ctrl + Intro">
          <Button variant="primary">Publicar</Button>
        </Tooltip>
      ),
    },
    {
      title: 'En un botón de icono',
      render: () => (
        <div className={demo.row}>
          <IconButton label="Compartir enlace" icon={Share2} />
        </div>
      ),
    },
  ],
  states: [],
  dos: [{ text: 'Úsalo para atajos de teclado o para repetir el nombre de un botón de icono.' }],
  donts: [{ text: 'No metas en él instrucciones necesarias: en pantallas táctiles puede no verse nunca.' }],
  a11y: [
    'Sale con el foco del teclado y se cierra con Escape.',
    'Espera medio segundo antes de salir para no tapar lo que se mira.',
    'Su texto se asocia al control con aria-describedby.',
  ],
  tokens: [
    'tooltip-bg',
    'tooltip-text',
    'tooltip-shadow',
    'tooltip-radius',
    'tooltip-padding-block',
    'tooltip-padding-inline',
  ],
}
