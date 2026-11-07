import type { IdeaView } from '@ytcreator/core/api'
import { Button, Card, format } from '@ytcreator/ui'
import { ideasEs } from '../../../strings/ideas.es.ts'
import styles from '../channel.module.css'

const text = ideasEs.queue
const named = (action: string, title: string) => format(ideasEs.measure.named, { accion: action, titulo: title })

export type OrderList = 'bank' | 'queue'
export type Direction = 'up' | 'down'

/** Where the focus goes back after a move: the same button of the same idea (contracts/ui-screens.md). */
export const orderKey = (list: OrderList, ideaId: string, direction: Direction) => `${list}:${ideaId}:${direction}`

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
          <p className={styles.notice}>{text.note}</p>
        </>
      )}
    </section>
  )
}

export type IdeaMove = 'elegida' | 'banco' | 'hecha' | 'archivada'

// The moves of an idea on its card (data-model.md, «Estados»): choose it, take it out of the queue, mark it as
// done or archive it. A done idea can only be archived.
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
