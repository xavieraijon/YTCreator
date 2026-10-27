import { RadioGroup } from '@ytcreator/ui'
import { Cloud, Cpu } from 'lucide-react'
import type { ComponentDoc } from './types.ts'

const durations = [
  { value: 'short', label: 'Corto (menos de 1 minuto)' },
  { value: 'medium', label: 'Medio (8 a 12 minutos)' },
  { value: 'long', label: 'Largo (más de 20 minutos)' },
]

const providers = [
  { value: 'local', label: 'En tu equipo', description: 'Gratis y privado; más lento.', icon: Cpu },
  { value: 'cloud', label: 'En la nube', description: 'Más rápido; necesita una clave.', icon: Cloud },
]

export const radioGroupDoc: ComponentDoc = {
  id: 'radio-group',
  name: 'RadioGroup',
  summary: 'Elige una opción entre pocas, todas a la vista.',
  group: 'forms',
  variants: [
    {
      title: 'Lista',
      render: () => <RadioGroup label="Duración del vídeo" options={durations} defaultValue="medium" />,
    },
    {
      title: 'Tarjetas',
      render: () => (
        <RadioGroup label="Dónde trabaja la IA" options={providers} defaultValue="local" appearance="cards" />
      ),
    },
  ],
  states: [
    {
      state: 'Error',
      render: () => <RadioGroup label="Duración del vídeo" options={durations} error="Elige una duración." />,
    },
    {
      state: 'Opción desactivada',
      render: () => (
        <RadioGroup
          label="Duración del vídeo"
          options={[...durations.slice(0, 2), { value: 'long', label: 'Largo (más de 20 minutos)', disabled: true }]}
        />
      ),
    },
  ],
  dos: [{ text: 'Usa tarjetas cuando cada opción necesite una explicación.' }],
  donts: [{ text: 'No lo uses con más de cinco opciones: usa un Select.' }],
  a11y: [
    'Es un fieldset con legend: el lector anuncia la pregunta al entrar.',
    'Tab entra en el grupo y las flechas cambian la opción.',
    'La opción elegida lleva un punto (y un check en las tarjetas), no solo color.',
  ],
  tokens: [
    'radio-bg',
    'radio-border',
    'radio-border-hover',
    'radio-checked',
    'radio-size',
    'radio-dot-size',
    'radio-card-bg',
    'radio-card-border',
    'radio-card-radius',
  ],
}
