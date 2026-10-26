import { IconButton } from '@ytcreator/ui'
import { Copy, Pencil, Trash2 } from 'lucide-react'
import demo from './demo.module.css'
import type { ComponentDoc } from './types.ts'

export const iconButtonDoc: ComponentDoc = {
  id: 'icon-button',
  name: 'IconButton',
  summary: 'Botón con solo un icono. Su etiqueta es el nombre accesible y el texto de la ayuda emergente.',
  group: 'actions',
  variants: [
    {
      title: 'Fantasma',
      render: () => (
        <div className={demo.row}>
          <IconButton label="Editar idea" icon={Pencil} />
          <IconButton label="Copiar título" icon={Copy} />
          <IconButton label="Borrar idea" icon={Trash2} variant="danger" />
        </div>
      ),
    },
    {
      title: 'Tamaños',
      render: () => (
        <div className={demo.row}>
          <IconButton label="Editar (pequeño)" icon={Pencil} size="sm" />
          <IconButton label="Editar (mediano)" icon={Pencil} size="md" />
          <IconButton label="Editar (grande)" icon={Pencil} size="lg" />
        </div>
      ),
    },
  ],
  states: [
    { state: 'Encima', render: () => <IconButton label="Editar idea" icon={Pencil} data-force-state="hover" /> },
    { state: 'Foco', render: () => <IconButton label="Editar idea" icon={Pencil} data-force-state="focus" /> },
    { state: 'Desactivado', render: () => <IconButton label="Editar idea" icon={Pencil} disabled /> },
  ],
  dos: [{ text: 'Úsalo para acciones conocidas y repetidas, como editar o copiar.' }],
  donts: [{ text: 'No lo uses para la acción principal: un texto visible siempre se entiende mejor.' }],
  a11y: [
    'La etiqueta es obligatoria: es el nombre accesible.',
    'La ayuda emergente sale al pasar el puntero y al recibir el foco.',
    'En pantallas táctiles mide al menos 44 × 44 px.',
  ],
  tokens: ['button-ghost-text', 'button-ghost-bg-hover', 'control-height-md', 'tooltip-bg'],
}
