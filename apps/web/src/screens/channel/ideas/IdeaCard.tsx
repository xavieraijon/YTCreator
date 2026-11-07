import type { IdeaView } from '@ytcreator/core/api'
import { Badge, Button, Card, format } from '@ytcreator/ui'
import type { ReactNode } from 'react'
import { ideasEs } from '../../../strings/ideas.es.ts'
import styles from '../channel.module.css'

const text = ideasEs.card

export function originText(idea: IdeaView, sourceTitle: string | null): string {
  if (idea.origin !== 'otro_enfoque') return text.origin[idea.origin]
  return sourceTitle ? format(text.origin.otro_enfoque, { titulo: sourceTitle }) : text.origin.otro_enfoque_sin_titulo
}

export interface IdeaCardProps {
  readonly idea: IdeaView
  /** The title of the idea an angle came from, if it is still in the bank. */
  readonly sourceTitle: string | null
  readonly onEdit: () => void
  /** What the stories after US1 add: the measure, the moves and the queue. */
  readonly children?: ReactNode
}

// One idea of the bank (contracts/ui-screens.md, «Lista de ideas»).
export function IdeaCard({ idea, sourceTitle, onEdit, children }: IdeaCardProps) {
  return (
    <Card as="li" className={styles.option}>
      <h3>{idea.title}</h3>
      <p>
        <Badge>{ideasEs.status[idea.status]}</Badge> <Badge>{originText(idea, sourceTitle)}</Badge>{' '}
        <Badge>{ideasEs.format[idea.format]}</Badge>
      </p>
      {idea.hook && <p>{format(text.hook, { texto: idea.hook })}</p>}
      {idea.pillar && <p>{format(text.pillar, { texto: idea.pillar })}</p>}
      {idea.fromOlderProfile && <p className={styles.notice}>{ideasEs.measure.olderProfile}</p>}
      {children}
      <div className={styles.actions}>
        <Button variant="ghost" aria-label={format(text.editNamed, { titulo: idea.title })} onClick={onEdit}>
          {text.edit}
        </Button>
      </div>
    </Card>
  )
}
