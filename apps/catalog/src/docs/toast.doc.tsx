import { Button, useToast } from '@ytcreator/ui'
import demo from './demo.module.css'
import type { ComponentDoc } from './types.ts'

function ToastDemo() {
  const { toast } = useToast()
  return (
    <div className={demo.row}>
      <Button onClick={() => toast({ title: 'Guion guardado', tone: 'success' })}>Mostrar aviso</Button>
      <Button
        onClick={() =>
          toast({
            title: 'Idea archivada',
            description: 'La encontrarás en Archivo.',
            action: { label: 'Deshacer', onClick: () => toast({ title: 'Idea recuperada' }) },
          })
        }
      >
        Aviso con acción
      </Button>
      <Button
        onClick={() =>
          toast({
            title: 'No se pudo guardar',
            description: 'Revisa la conexión y vuelve a intentarlo.',
            tone: 'danger',
          })
        }
      >
        Aviso de error
      </Button>
    </div>
  )
}

function LongToastDemo() {
  const { toast } = useToast()
  return (
    <Button
      onClick={() =>
        toast({
          title: 'Configuración del canal guardada correctamente',
          description:
            'Los cambios en la descripción, las palabras clave y la miniatura por defecto se aplicarán a los próximos vídeos que prepares.',
          action: { label: 'Personalizar', onClick: () => toast({ title: 'Abriendo la configuración' }) },
        })
      }
    >
      Aviso con texto largo
    </Button>
  )
}

export const toastDoc: ComponentDoc = {
  id: 'toast',
  name: 'Toast',
  summary: 'Aviso breve que confirma algo que ya ha pasado. Se va solo, salvo si tiene una acción.',
  group: 'communication',
  variants: [{ title: 'Tonos y acción', render: () => <ToastDemo /> }],
  states: [{ state: 'Texto largo (se ajusta en varias líneas)', render: () => <LongToastDemo /> }],
  dos: [{ text: 'Úsalo para confirmar en pasado: «Guion guardado».' }],
  donts: [
    { text: 'No lo uses para errores que bloquean una tarea: ahí va un ErrorMessage junto a la tarea.' },
    { text: 'No metas en él la única forma de hacer algo.' },
  ],
  a11y: [
    'Se anuncia en una región viva; los errores interrumpen y el resto espera su turno.',
    'F8 lleva el foco a la región de avisos.',
    'Dura más cuanto más largo es el texto y no se va mientras el puntero o el foco están encima; con una acción, no se va solo.',
  ],
  tokens: ['toast-bg', 'toast-border', 'color-text-primary', 'toast-shadow', 'toast-radius', 'z-toast'],
}
