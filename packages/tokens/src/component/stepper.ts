import { component, type ComponentToken } from '../types.ts'
import { sem } from './semantic-ref.ts'

export const stepperTokens: readonly ComponentToken[] = [
  component({
    name: 'stepper-line',
    category: 'color',
    value: sem('color-border-strong'),
    description: 'Línea entre pasos.',
  }),
  component({
    name: 'stepper-marker-border',
    category: 'color',
    value: sem('color-border-strong'),
    description: 'Borde del marcador de un paso pendiente.',
  }),
  component({
    name: 'stepper-done',
    category: 'color',
    value: sem('color-accent'),
    description: 'Marcador de los pasos completado y actual.',
  }),
  component({
    name: 'stepper-marker-size',
    category: 'space',
    value: sem('target-min'),
    description: 'Diámetro del marcador.',
  }),
]
