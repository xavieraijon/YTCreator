import { GlassPanel } from '@ytcreator/ui'
import demo from './demo.module.css'
import type { ComponentDoc } from './types.ts'

function Stage({ elevation }: { readonly elevation?: 2 | 3 }) {
  return (
    <div className={demo.busy}>
      <p aria-hidden className={demo.backdropText}>
        Ideas · Guion · Miniatura · Título · Descripción · Subtítulos · Ideas · Guion · Miniatura · Título
      </p>
      <GlassPanel elevation={elevation} className={demo.narrowPanel}>
        <strong>Ajustes rápidos</strong>
        <p className={demo.muted}>Tema, idioma y proveedor de IA.</p>
      </GlassPanel>
    </div>
  )
}

export const glassPanelDoc: ComponentDoc = {
  id: 'glass-panel',
  name: 'GlassPanel',
  summary:
    'Capa flotante translúcida que deja intuir el fondo. Para menús, barras y paneles que flotan sobre el contenido.',
  group: 'containers',
  variants: [
    { title: 'Elevación 2', render: () => <Stage /> },
    { title: 'Elevación 3', render: () => <Stage elevation={3} /> },
  ],
  states: [],
  dos: [{ text: 'Úsalo para capas que flotan sobre un fondo con detalle: barras, menús y paneles breves.' }],
  donts: [
    { text: 'Nunca en guiones, descripciones u otra lectura larga: usa una superficie sólida.' },
    { text: 'No apiles un cristal sobre otro cristal.' },
  ],
  a11y: [
    'El texto sobre cristal cumple el mismo contraste que sobre una superficie sólida.',
    'Con transparencia reducida, o si el navegador no desenfoca, pasa a ser una superficie sólida.',
    'Con colores forzados tiene un borde del color del sistema y sin sombra.',
  ],
  tokens: [
    'glass-panel-bg',
    'glass-panel-border',
    'glass-panel-highlight',
    'glass-panel-blur',
    'glass-panel-radius',
    'glass-panel-padding',
    'shadow-2',
    'shadow-3',
  ],
}
