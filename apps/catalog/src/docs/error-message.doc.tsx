import { ErrorMessage } from '@ytcreator/ui'
import type { ComponentDoc } from './types.ts'

export const errorMessageDoc: ComponentDoc = {
  id: 'error-message',
  name: 'ErrorMessage',
  summary: 'Error que bloquea una tarea. Siempre dice qué pasó y ofrece una salida.',
  group: 'communication',
  variants: [
    {
      title: 'Con acción',
      render: () => (
        <ErrorMessage
          title="No se pudo conectar con la IA"
          description="El programa de IA no responde. Comprueba que está abierto y vuelve a intentarlo."
          action={{ label: 'Reintentar', onClick: () => undefined }}
        />
      ),
    },
  ],
  states: [],
  dos: [{ text: 'Explica en palabras sencillas qué pasó y qué puede hacer la persona.' }],
  donts: [{ text: 'No muestres códigos técnicos sin explicación ni culpes a quien usa la aplicación.' }],
  a11y: [
    'Con «live», se anuncia en cuanto aparece (role="alert").',
    'Lleva icono y título, no solo color.',
    'La acción es obligatoria: un error nunca deja sin salida.',
  ],
  tokens: ['error-message-bg', 'error-message-border', 'error-message-text', 'error-message-radius', 'color-danger-fg'],
}
