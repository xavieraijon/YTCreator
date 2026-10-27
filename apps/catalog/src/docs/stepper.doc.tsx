import { Stepper } from '@ytcreator/ui'
import type { ComponentDoc } from './types.ts'

const steps = [
  { id: 'idea', label: 'Elegir la idea' },
  { id: 'outline', label: 'Preparar el esquema' },
  { id: 'script', label: 'Escribir el guion' },
  { id: 'package', label: 'Preparar la publicación' },
  { id: 'subtitles', label: 'Crear los subtítulos' },
]

export const stepperDoc: ComponentDoc = {
  id: 'stepper',
  name: 'Stepper',
  summary: 'Muestra en qué paso de un flujo estás y cuántos quedan.',
  group: 'progress',
  variants: [
    { title: 'En el paso 3', render: () => <Stepper steps={steps} current={3} /> },
    { title: 'Al empezar', render: () => <Stepper steps={steps.slice(0, 3)} current={1} /> },
  ],
  states: [{ state: 'Último paso', render: () => <Stepper steps={steps.slice(0, 3)} current={3} /> }],
  dos: [{ text: 'Nombra cada paso con lo que hace la persona: «Escribir el guion».' }],
  donts: [{ text: 'No pases de cinco o seis pasos: divide el flujo.' }],
  a11y: [
    'Es una lista ordenada; el paso actual lleva `aria-current="step"`.',
    'Cada paso dice su estado con texto oculto («completado», «paso actual», «pendiente») y con forma: check, borde continuo o discontinuo.',
    'La posición «Paso 3 de 5» siempre está visible; en móvil solo se ve la etiqueta del paso actual.',
  ],
  tokens: ['stepper-done', 'stepper-line', 'stepper-marker-border', 'stepper-marker-size', 'color-text-on-accent'],
}
