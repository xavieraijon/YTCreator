import type { IdeaView } from '@ytcreator/core/api'
import { Badge, Button, Card, ErrorMessage, format } from '@ytcreator/ui'
import { useState } from 'react'
import { scriptsApi } from '../../../api/client.ts'
import { navigate } from '../../../router.ts'
import { errorText } from '../../../shell/errorText.ts'
import { es } from '../../../strings/es.ts'
import { ideasEs } from '../../../strings/ideas.es.ts'
import { scriptEs } from '../../../strings/script.es.ts'
import styles from '../channel.module.css'

const text = ideasEs.queue
const named = (action: string, title: string) => format(ideasEs.measure.named, { accion: action, titulo: title })

export type OrderList = 'bank' | 'queue'
export type Direction = 'up' | 'down'

/** Where the focus goes back after a move: the same button of the same idea (contracts/ui-screens.md). */
export const orderKey = (list: OrderList, ideaId: string, direction: Direction) => `${list}:${ideaId}:${direction}`

const scriptAction = (idea: IdeaView) => {
  if (idea.script?.status === 'guion_aprobado') return scriptEs.queue.see
  return idea.script ? scriptEs.queue.resume : scriptEs.queue.prepare
}

export interface OrderButtonsProps {
  readonly list: OrderList
  readonly idea: IdeaView
  readonly first: boolean
  readonly last: boolean
  readonly busy: boolean
  readonly onMove: (direction: Direction) => void
}

// «Subir» and «Bajar», named after the idea. At an edge the button stays, marked as not available, so the focus
// that comes back to it after a move is not lost.
export function OrderButtons({ list, idea, first, last, busy, onMove }: OrderButtonsProps) {
  const button = (direction: Direction, label: string, edge: boolean) => (
    <Button
      variant="ghost"
      size="sm"
      data-order={orderKey(list, idea.id, direction)}
      aria-label={named(label, idea.title)}
      aria-disabled={edge || busy || undefined}
      onClick={() => {
        if (!edge && !busy) onMove(direction)
      }}
    >
      {label}
    </Button>
  )
  return (
    <>
      {button('up', list === 'queue' ? ideasEs.order.upQueue : ideasEs.order.up, first)}
      {button('down', list === 'queue' ? ideasEs.order.downQueue : ideasEs.order.down, last)}
    </>
  )
}

export interface IdeaQueueProps {
  /** The chosen ideas, in the order of the queue. */
  readonly ideas: readonly IdeaView[]
  readonly busy: boolean
  readonly onMove: (ideaId: string, direction: Direction) => void
  readonly onRemove: (idea: IdeaView) => void
}

// «Próximos vídeos»: the chosen ideas in the order the creator wants to make them (US4).
export function IdeaQueue({ ideas, busy, onMove, onRemove }: IdeaQueueProps) {
  const [failed, setFailed] = useState<{ idea: IdeaView; cause: unknown } | null>(null)

  // The script is created the first time it is opened, so opening costs nothing (data-model.md).
  const openScript = async (idea: IdeaView) => {
    setFailed(null)
    try {
      const script = idea.script ?? (await scriptsApi.open(idea.id))
      navigate({ page: 'script', id: script.id })
    } catch (cause) {
      setFailed({ idea, cause })
    }
  }

  return (
    <section aria-labelledby="idea-queue-title">
      <h2 id="idea-queue-title">{text.title}</h2>
      <p className={styles.why}>{text.why}</p>
      {ideas.length === 0 ? (
        <p>{text.empty}</p>
      ) : (
        <>
          <ol className={styles.options}>
            {ideas.map((idea, index) => (
              <Card as="li" key={idea.id} className={styles.option}>
                {/* The number is written: the cards do not show the one of the list (AS3, which goes next). */}
                <h3>{format(text.place, { n: String(index + 1), titulo: idea.title })}</h3>
                <div className={styles.actions}>
                  {idea.script?.status === 'guion_aprobado' && <Badge>{scriptEs.queue.ready}</Badge>}
                  <Button
                    variant={index === 0 ? 'primary' : 'secondary'}
                    size="sm"
                    aria-label={format(scriptEs.queue.named, { accion: scriptAction(idea), titulo: idea.title })}
                    data-script-open={idea.id}
                    onClick={() => void openScript(idea)}
                  >
                    {scriptAction(idea)}
                  </Button>
                  <OrderButtons
                    list="queue"
                    idea={idea}
                    first={index === 0}
                    last={index === ideas.length - 1}
                    busy={busy}
                    onMove={(direction) => onMove(idea.id, direction)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={named(text.remove, idea.title)}
                    aria-disabled={busy || undefined}
                    onClick={() => !busy && onRemove(idea)}
                  >
                    {text.remove}
                  </Button>
                </div>
              </Card>
            ))}
          </ol>
          {failed && (
            <ErrorMessage
              live
              title={errorText(failed.cause)}
              action={{ label: es.app.retry, onClick: () => void openScript(failed.idea) }}
            />
          )}
        </>
      )}
    </section>
  )
}

export type IdeaMove = 'elegida' | 'banco' | 'hecha' | 'archivada'

// The moves of an idea on its card (data-model.md, «Estados»): choose it, take it out of the queue, mark it as
// done or archive it. A done idea can go back to the bank or be archived.
export function IdeaMoves({
  idea,
  busy,
  onStatus,
}: {
  idea: IdeaView
  busy: boolean
  onStatus: (status: IdeaMove) => void
}) {
  const moves: { status: IdeaMove; label: string }[] = [
    ...(idea.status === 'banco' ? [{ status: 'elegida' as const, label: ideasEs.moves.choose }] : []),
    ...(idea.status === 'elegida' ? [{ status: 'banco' as const, label: text.remove }] : []),
    ...(idea.status !== 'hecha' ? [{ status: 'hecha' as const, label: ideasEs.moves.done }] : []),
    ...(idea.status === 'hecha' ? [{ status: 'banco' as const, label: ideasEs.moves.undone }] : []),
    { status: 'archivada', label: ideasEs.moves.archive },
  ]
  return (
    <>
      {moves.map((move) => (
        <Button
          key={move.status}
          variant="ghost"
          size="sm"
          aria-label={named(move.label, idea.title)}
          aria-disabled={busy || undefined}
          onClick={() => !busy && onStatus(move.status)}
        >
          {move.label}
        </Button>
      ))}
    </>
  )
}
