import { Button, Dialog, TextField } from '@ytcreator/ui'
import { useState } from 'react'
import type { ComponentDoc } from './types.ts'

function TitleDialogDemo() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Abrir diálogo</Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Cambiar el título"
        description="El título nuevo se verá en la lista de ideas."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={() => setOpen(false)}>
              Guardar título
            </Button>
          </>
        }
      >
        <TextField label="Título" defaultValue="Cómo empezar un canal" />
      </Dialog>
    </>
  )
}

function ConfirmDialogDemo() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Borrar idea
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="sm"
        title="¿Borrar esta idea?"
        description="Se borrará también su guion. No se puede deshacer."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Conservar
            </Button>
            <Button variant="danger" onClick={() => setOpen(false)}>
              Borrar idea
            </Button>
          </>
        }
      />
    </>
  )
}

export const dialogDoc: ComponentDoc = {
  id: 'dialog',
  name: 'Dialog',
  summary: 'Ventana modal para una tarea corta que interrumpe a propósito. Cristal sobre la página.',
  group: 'containers',
  variants: [
    { title: 'Con formulario', render: () => <TitleDialogDemo /> },
    { title: 'Confirmación', render: () => <ConfirmDialogDemo /> },
  ],
  states: [],
  dos: [{ text: 'Pon la acción principal la última y di qué hace: «Guardar título», no «Aceptar».' }],
  donts: [{ text: 'No abras un diálogo desde otro diálogo.' }],
  a11y: [
    'Es un <dialog> nativo: la página queda inerte y Escape lo cierra.',
    'El foco entra al abrir, no sale con Tab y vuelve al botón que lo abrió al cerrar.',
    'El título le da nombre y la descripción se lee con aria-describedby.',
  ],
  tokens: [
    'dialog-bg',
    'dialog-border',
    'dialog-shadow',
    'dialog-radius',
    'dialog-padding',
    'glass-blur',
    'color-surface-overlay',
  ],
}
