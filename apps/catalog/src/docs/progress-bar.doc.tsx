import { ProgressBar } from '@ytcreator/ui'
import demo from './demo.module.css'
import type { ComponentDoc } from './types.ts'

export const progressBarDoc: ComponentDoc = {
  id: 'progress-bar',
  name: 'ProgressBar',
  summary: 'Avance de una tarea larga cuando se sabe cuánto falta.',
  group: 'progress',
  variants: [
    {
      title: 'Con valor',
      render: () => (
        <div className={demo.column}>
          <ProgressBar label="Subiendo el vídeo" value={64} />
        </div>
      ),
    },
    {
      title: 'Indeterminada',
      render: () => (
        <div className={demo.column}>
          <ProgressBar label="Preparando la subida" />
        </div>
      ),
    },
  ],
  states: [
    {
      state: 'Vacía',
      render: () => (
        <div className={demo.column}>
          <ProgressBar label="Subiendo el vídeo" value={0} />
        </div>
      ),
    },
    {
      state: 'Completa',
      render: () => (
        <div className={demo.column}>
          <ProgressBar label="Subiendo el vídeo" value={100} />
        </div>
      ),
    },
  ],
  dos: [{ text: 'Di qué avanza en la etiqueta: «Subiendo el vídeo».' }],
  donts: [{ text: 'No inventes un porcentaje: si no lo sabes, usa la variante indeterminada.' }],
  a11y: [
    'Es un `progressbar` con su valor, mínimo y máximo, nombrado por la etiqueta visible.',
    'El porcentaje se ve como texto, no solo como longitud.',
    'Con movimiento reducido, la indeterminada se queda quieta.',
  ],
  tokens: ['progress-bar-track', 'progress-bar-fill', 'progress-bar-height', 'radius-full'],
}
