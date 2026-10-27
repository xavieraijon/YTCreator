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
            title: 'El título es muy largo',
            description: 'YouTube corta a partir de 100 caracteres.',
            tone: 'warning',
          })
        }
      >
        Aviso de atención
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
  summary:
    'Aviso breve. Las confirmaciones se van solas (con una barra que muestra el tiempo que queda); los avisos de atención, los errores y los que tienen una acción se quedan hasta que se cierran.',
  group: 'communication',
  variants: [{ title: 'Tonos y acción', render: () => <ToastDemo /> }],
  states: [{ state: 'Texto largo (se ajusta en varias líneas)', render: () => <LongToastDemo /> }],
  dos: [
    {
      text: 'Temporal (por defecto en `success` e `info` sin acción): confirma en pasado lo que la persona acaba de hacer, «Guion guardado». Dura de 5 a 12 s según el texto.',
    },
    {
      text: 'Persistente (por defecto en `warning`, `danger` y con acción): pide leer algo entero, decidir o deshacer.',
    },
    { text: "Usa `duration: 'persistent'` si el mensaje no se puede recuperar en otro sitio, aunque sea `info`." },
  ],
  donts: [
    { text: 'No lo uses para errores que bloquean una tarea: ahí va un ErrorMessage junto a la tarea.' },
    { text: 'No metas en él la única forma de hacer algo.' },
    { text: 'No acortes la duración por debajo de la calculada: tiene que dar tiempo a leerlo.' },
  ],
  a11y: [
    'Se anuncia en una región viva; los errores interrumpen y el resto espera su turno.',
    'F8 lleva el foco a la región de avisos.',
    'El temporal dura más cuanto más largo es el texto y se pausa mientras el puntero o el foco están encima o la ventana no tiene el foco (FR-012a).',
    'Con «reducir movimiento» la barra de tiempo no se muestra; el aviso se va igual.',
  ],
  tokens: ['toast-bg', 'toast-border', 'color-text-primary', 'toast-shadow', 'toast-radius', 'z-toast'],
}
