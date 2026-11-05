import type { KnowledgeAges, UsageList } from '@ytcreator/core/api'
import { ErrorMessage, format } from '@ytcreator/ui'
import { useCallback, useEffect, useState } from 'react'
import { usageApi } from '../../api/client.ts'
import { errorText } from '../../shell/errorText.ts'
import { es } from '../../strings/es.ts'
import { formatEuros } from './euros.ts'
import styles from './settings.module.css'

const text = es.usage
const when = (iso: string) =>
  new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
const day = (date: string) =>
  new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(date))

// Ajustes → Consumo (contracts/cost.md): the totals of today and the month, and each call with its use and amount.
export function UsageLogView({ usage }: { usage: UsageList }) {
  return (
    <section className={styles.section}>
      <p className={styles.text}>{text.why}</p>
      <p>
        <strong>{format(text.today, { importe: formatEuros(usage.todayCents) })}</strong>
      </p>
      <p>
        <strong>{format(text.month, { importe: formatEuros(usage.monthCents) })}</strong>
      </p>
      <h2>{text.list}</h2>
      {usage.items.length === 0 ? (
        <p className={styles.text}>{text.empty}</p>
      ) : (
        <ul className={styles.accounts}>
          {usage.items.map((item) => (
            <li key={item.id} className={styles.row}>
              <span>{when(item.createdAt)}</span>
              <span>{format(text.item, { uso: text.uses[item.use], importe: formatEuros(item.costCents) })}</span>
              {item.outcome !== 'ok' && <span className={styles.text}>{text.failed}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// contracts/knowledge.md: what YTCreator knows about YouTube that has not been reviewed in more than 180 days.
export function KnowledgeAge({
  files,
  staleAfterDays = 180,
}: {
  files: KnowledgeAges['files']
  staleAfterDays?: number
}) {
  const stale = files.filter((file) => file.stale)
  if (stale.length === 0) return null
  return (
    <section className={styles.section}>
      <h2>{text.knowledge}</h2>
      <p className={styles.text}>{format(text.knowledgeWhy, { dias: String(staleAfterDays) })}</p>
      <ul>
        {stale.map((file) => (
          <li key={file.id}>{format(text.knowledgeItem, { fuente: file.label, fecha: day(file.reviewedAt) })}</li>
        ))}
      </ul>
    </section>
  )
}

export function UsageLog() {
  const [usage, setUsage] = useState<UsageList | null>(null)
  const [knowledge, setKnowledge] = useState<KnowledgeAges | null>(null)
  const [error, setError] = useState<unknown>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [list, ages] = await Promise.all([usageApi.list(), usageApi.knowledge()])
      setUsage(list)
      setKnowledge(ages)
    } catch (caught) {
      setError(caught)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (error !== null) {
    return <ErrorMessage live title={errorText(error)} action={{ label: es.app.retry, onClick: () => void load() }} />
  }
  if (!usage) return <p role="status">{es.app.loading}</p>
  return (
    <div className={styles.stack}>
      <UsageLogView usage={usage} />
      {knowledge && <KnowledgeAge files={knowledge.files} staleAfterDays={knowledge.staleAfterDays} />}
    </div>
  )
}
