import { Disclosure, TextField } from '@ytcreator/ui'
import demo from './demo.module.css'
import type { ComponentDoc } from './types.ts'

export const disclosureDoc: ComponentDoc = {
  id: 'disclosure',
  name: 'Disclosure',
  summary: 'Muestra u oculta contenido opcional, como ajustes avanzados.',
  group: 'containers',
  variants: [
    {
      title: 'Cerrado',
      render: () => (
        <Disclosure summary="Modo experto">
          <TextField label="Palabra clave" description="La IA la usará en el título y la descripción." />
        </Disclosure>
      ),
    },
    {
      title: 'Abierto',
      render: () => (
        <Disclosure summary="Por qué te lo sugerimos" defaultOpen>
          <p className={demo.muted}>Los vídeos de este tema tienen muchas búsquedas y pocos competidores.</p>
        </Disclosure>
      ),
    },
  ],
  states: [
    {
      state: 'Encima',
      render: () => (
        <Disclosure summary="Modo experto (encima)" data-force-state="hover">
          <p>Contenido</p>
        </Disclosure>
      ),
    },
    {
      state: 'Foco',
      render: () => (
        <Disclosure summary="Modo experto (foco)" data-force-state="focus">
          <p>Contenido</p>
        </Disclosure>
      ),
    },
  ],
  dos: [{ text: 'Úsalo para lo que la mayoría no necesita ver.' }],
  donts: [{ text: 'No escondas en él información necesaria para terminar la tarea.' }],
  a11y: [
    'Es un <details> nativo: Enter y Espacio lo abren y cierran.',
    'Lo que hay dentro de uno cerrado no recibe el foco.',
    'La flecha gira para indicar el estado, además de lo que anuncia el navegador.',
  ],
  tokens: ['disclosure-border', 'color-text-primary', 'color-text-accent', 'control-height-md'],
}
