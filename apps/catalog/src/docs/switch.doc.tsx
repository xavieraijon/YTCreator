import { Switch } from '@ytcreator/ui'
import type { ComponentDoc } from './types.ts'

export const switchDoc: ComponentDoc = {
  id: 'switch',
  name: 'Switch',
  summary: 'Enciende o apaga algo con efecto inmediato.',
  group: 'forms',
  variants: [
    { title: 'Apagado', render: () => <Switch label="Subtítulos automáticos" /> },
    {
      title: 'Encendido con ayuda',
      render: () => <Switch label="Guardar mientras escribo" description="Cada pocos segundos." defaultChecked />,
    },
  ],
  states: [
    { state: 'Encima', render: () => <Switch label="Subtítulos automáticos" data-force-state="hover" /> },
    { state: 'Foco', render: () => <Switch label="Subtítulos automáticos" data-force-state="focus" /> },
    { state: 'Desactivado', render: () => <Switch label="Subtítulos automáticos" disabled /> },
  ],
  dos: [{ text: 'Úsalo para ajustes que se aplican al momento.' }],
  donts: [{ text: 'No lo uses en un formulario que se envía después: ahí va un Checkbox.' }],
  a11y: [
    'Es un checkbox con role="switch": se anuncia como activado o desactivado y Espacio lo cambia.',
    'La posición del círculo, no solo el color, dice si está encendido.',
  ],
  tokens: [
    'switch-track',
    'switch-track-border',
    'switch-track-on',
    'switch-thumb',
    'switch-thumb-on',
    'switch-track-width',
    'switch-thumb-size',
  ],
}
