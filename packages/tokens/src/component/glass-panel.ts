import { component, type ComponentToken } from '../types.ts'
import { sem } from './semantic-ref.ts'

export const glassPanelTokens: readonly ComponentToken[] = [
  component({
    name: 'glass-panel-bg',
    category: 'glass',
    value: sem('glass-bg'),
    description: 'Fondo translúcido; con transparencia reducida pasa a ser sólido.',
  }),
  component({
    name: 'glass-panel-border',
    category: 'glass',
    value: sem('glass-border'),
    description: 'Borde que separa el panel del fondo.',
  }),
  component({
    name: 'glass-panel-highlight',
    category: 'glass',
    value: sem('glass-highlight'),
    description: 'Luz interior del borde superior.',
  }),
  component({
    name: 'glass-panel-blur',
    category: 'glass',
    value: sem('glass-blur'),
    description: 'Desenfoque del fondo.',
  }),
  component({
    name: 'glass-panel-radius',
    category: 'radius',
    value: sem('radius-xl'),
    description: 'Radio del panel.',
  }),
  component({
    name: 'glass-panel-padding',
    category: 'space',
    value: sem('space-5'),
    description: 'Relleno interior.',
  }),
]
