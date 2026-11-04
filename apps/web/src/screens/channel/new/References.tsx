import type { JourneyFullView, ReferenceChannelView } from '@ytcreator/core/api'
import { Button, Card, DataSource, ErrorMessage, format, TextField } from '@ytcreator/ui'
import { useState } from 'react'
import { channelApi } from '../../../api/client.ts'
import { errorText } from '../../../shell/errorText.ts'
import { channelEs } from '../../../strings/channel.es.ts'
import { es } from '../../../strings/es.ts'
import styles from '../channel.module.css'

const text = channelEs.references
const number = (value: number) => new Intl.NumberFormat('es-ES').format(value)
const times = (value: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(value)

export interface ReferenceCardProps {
  readonly reference: ReferenceChannelView
  readonly canRemove: boolean
  readonly onRemove: () => void
}

// Figures are data; why it is a good example comes from a fixed rule, not from the AI.
export function ReferenceCard({ reference, canRemove, onRemove }: ReferenceCardProps) {
  return (
    <Card as="article" className={styles.niche} aria-label={reference.title}>
      <h3>{reference.title}</h3>
      <p>{text.reason[reference.reason]}</p>
      <p>
        {reference.subscribers === null
          ? text.hiddenSubscribers
          : format(text.subscribers, { cifra: number(reference.subscribers) })}
      </p>
      {reference.reason !== 'anadido_por_ti' && (
        <p>{format(text.topVideo, { visitas: number(reference.topVideoViews) })}</p>
      )}
      {reference.medianViews !== null && <p>{format(text.normal, { visitas: number(reference.medianViews) })}</p>}
      {reference.bestRatio !== null && reference.bestVideoTitle !== null && (
        <p>{format(text.best, { titulo: reference.bestVideoTitle, veces: times(reference.bestRatio) })}</p>
      )}
      <DataSource kind="youtube" date={reference.fetchedAt} />
      {canRemove && (
        <div className={styles.actions}>
          <Button aria-label={`${text.remove} ${reference.title}`} onClick={onRemove}>
            {text.remove}
          </Button>
        </div>
      )}
    </Card>
  )
}

const MIN = 2
const MAX = 4

export function References({ view, measureId }: { view: JourneyFullView; measureId: string }) {
  const [list, setList] = useState<readonly ReferenceChannelView[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [adding, setAdding] = useState('')

  const change = async (body: { add?: string; remove?: string } = {}) => {
    setBusy(true)
    setError(null)
    try {
      setList(await channelApi.references(view.id, { measureId, ...body }))
      setAdding('')
    } catch (caught) {
      setError(caught)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={styles.options} aria-label={text.title}>
      <h2>{text.title}</h2>
      <p className={styles.why}>{text.why}</p>
      {error !== null && (
        <ErrorMessage live title={errorText(error)} action={{ label: es.app.retry, onClick: () => void change() }} />
      )}
      {list === null ? (
        <div className={styles.actions}>
          <Button loading={busy} onClick={() => void change()}>
            {text.show}
          </Button>
        </div>
      ) : (
        <>
          {list.map((reference) => (
            <ReferenceCard
              key={reference.youtubeChannelId}
              reference={reference}
              canRemove={list.length > MIN}
              onRemove={() => void change({ remove: reference.youtubeChannelId })}
            />
          ))}
          {list.length < MAX && (
            <form
              className={styles.form}
              onSubmit={(event) => {
                event.preventDefault()
                if (adding.trim()) void change({ add: adding.trim() })
              }}
            >
              <TextField
                label={text.add.label}
                description={text.add.help}
                optional
                value={adding}
                onChange={(event) => setAdding(event.target.value)}
              />
              <div className={styles.actions}>
                <Button type="submit" loading={busy} disabled={!adding.trim()}>
                  {text.add.action}
                </Button>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  )
}
