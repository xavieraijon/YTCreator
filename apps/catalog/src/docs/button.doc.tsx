import { Button } from '@ytcreator/ui'
import { Sparkles } from 'lucide-react'
import { Icon } from '@ytcreator/ui'
import demo from './demo.module.css'
import type { ComponentDoc } from './types.ts'

export const buttonDoc: ComponentDoc = {
  id: 'button',
  name: 'Button',
  summary: 'Lanza una acción. Hay un solo botón principal por vista.',
  group: 'actions',
  variants: [
    {
      title: 'Variantes',
      render: () => (
        <div className={demo.row}>
          <Button variant="primary">Generar guion</Button>
          <Button>Guardar borrador</Button>
          <Button variant="ghost">Cancelar</Button>
          <Button variant="danger">Borrar idea</Button>
        </div>
      ),
    },
    {
      title: 'Tamaños',
      render: () => (
        <div className={demo.row}>
          <Button size="sm">Pequeño</Button>
          <Button size="md">Mediano</Button>
          <Button size="lg">Grande</Button>
        </div>
      ),
    },
    {
      title: 'Con icono',
      render: () => (
        <Button variant="primary">
          <Icon icon={Sparkles} size="sm" />
          Proponer títulos
        </Button>
      ),
    },
  ],
  states: [
    {
      state: 'Encima',
      render: () => (
        <Button variant="primary" data-force-state="hover">
          Generar guion
        </Button>
      ),
    },
    {
      state: 'Foco',
      render: () => (
        <Button variant="primary" data-force-state="focus">
          Generar guion
        </Button>
      ),
    },
    {
      state: 'Pulsado',
      render: () => (
        <Button variant="primary" data-force-state="active">
          Generar guion
        </Button>
      ),
    },
    {
      state: 'Desactivado',
      render: () => (
        <Button variant="primary" disabled>
          Generar guion
        </Button>
      ),
    },
    {
      state: 'Cargando',
      render: () => (
        <Button variant="primary" loading>
          Generar guion
        </Button>
      ),
    },
    {
      state: 'Texto largo',
      render: () => (
        <div className={demo.narrow}>
          <Button>Guardar el borrador y volver a la lista de ideas</Button>
        </div>
      ),
    },
  ],
  dos: [{ text: 'Empieza el texto con un verbo que diga lo que pasará: «Generar guion».' }],
  donts: [
    { text: 'No pongas dos botones principales en la misma vista.' },
    { text: 'No desactives un botón sin decir por qué: explica qué falta cerca de él.' },
  ],
  a11y: [
    'Es un <button> nativo: Enter y Espacio lo activan.',
    'Al cargar conserva el foco y su nombre, y anuncia «Cargando…»; no se puede pulsar dos veces.',
    'Mide 44 px de alto en pantallas táctiles.',
  ],
  tokens: [
    'button-bg',
    'button-bg-hover',
    'button-border',
    'button-text',
    'button-primary-bg',
    'button-primary-bg-hover',
    'button-primary-text',
    'button-ghost-text',
    'button-danger-bg',
    'button-danger-text',
    'button-radius',
    'button-padding-inline',
    'control-height-md',
  ],
}
