import { Checkbox } from '@ytcreator/ui'
import type { ComponentDoc } from './types.ts'

export const checkboxDoc: ComponentDoc = {
  id: 'checkbox',
  name: 'Checkbox',
  summary: 'Casilla de sí o no que se aplica al enviar el formulario.',
  group: 'forms',
  variants: [
    {
      title: 'Lista',
      render: () => (
        <div>
          <Checkbox label="Incluir capítulos" defaultChecked />
          <Checkbox label="Incluir enlaces" description="Al final de la descripción." />
        </div>
      ),
    },
    { title: 'Indeterminada', render: () => <Checkbox label="Todas las plataformas" indeterminate /> },
  ],
  states: [
    { state: 'Encima', render: () => <Checkbox label="Incluir capítulos" data-force-state="hover" /> },
    { state: 'Foco', render: () => <Checkbox label="Incluir capítulos" data-force-state="focus" /> },
    {
      state: 'Error',
      render: () => <Checkbox label="Acepto las normas de la comunidad" error="Acéptalas para publicar." />,
    },
    { state: 'Desactivado', render: () => <Checkbox label="Incluir capítulos" disabled defaultChecked /> },
  ],
  dos: [{ text: 'Escribe la etiqueta en positivo: «Incluir capítulos», no «No excluir capítulos».' }],
  donts: [{ text: 'No la uses para un efecto inmediato: ahí va un Switch.' }],
  a11y: [
    'Es un checkbox nativo; el estado indeterminado se anuncia como «mixto».',
    'Cada casilla ocupa al menos 24 × 24 px y hay espacio entre casillas apiladas.',
  ],
  tokens: [
    'checkbox-bg',
    'checkbox-border',
    'checkbox-border-hover',
    'checkbox-checked-bg',
    'checkbox-checked-mark',
    'checkbox-radius',
    'checkbox-size',
  ],
}
