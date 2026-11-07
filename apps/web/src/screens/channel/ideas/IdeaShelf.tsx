import { IDEA_VERDICTS, type IdeaFormat, type IdeaStatus } from '@ytcreator/core'
import type { IdeaView } from '@ytcreator/core/api'
import { Button, Disclosure, format, Select } from '@ytcreator/ui'
import { ideasEs } from '../../../strings/ideas.es.ts'
import styles from '../channel.module.css'
import { number } from './IdeaMeasure.tsx'

// The filters, the archive and the downloads of the bank (contracts/ui-screens.md, US4).
const text = ideasEs.filters
const ALL = 'todas'
const statusId = 'idea-filter-status'
const UNMEASURED = 'sin_medir'

export interface IdeaFilters {
  readonly status: string
  readonly format: string
  readonly verdict: string
}
export const NO_FILTERS: IdeaFilters = { status: ALL, format: ALL, verdict: ALL }
export const hasFilters = (filters: IdeaFilters) =>
  filters.status !== ALL || filters.format !== ALL || filters.verdict !== ALL

// The semaphore an idea shows: its verdict, or «Sin medir» without a measure or with a failed one.
const verdictOf = (idea: IdeaView) =>
  idea.measure?.status === 'medida' && idea.measure.verdict ? idea.measure.verdict : UNMEASURED

export function filterIdeas(ideas: readonly IdeaView[], filters: IdeaFilters): IdeaView[] {
  return ideas.filter(
    (idea) =>
      (filters.status === ALL || idea.status === filters.status) &&
      (filters.format === ALL || idea.format === filters.format) &&
      (filters.verdict === ALL || verdictOf(idea) === filters.verdict),
  )
}

const STATUSES: readonly Exclude<IdeaStatus, 'archivada'>[] = ['banco', 'elegida', 'hecha']
const FORMATS: readonly IdeaFormat[] = ['largo', 'short']

export interface FiltersProps {
  readonly filters: IdeaFilters
  readonly shown: number
  readonly total: number
  readonly onChange: (filters: IdeaFilters) => void
}

export function Filters({ filters, shown, total, onChange }: FiltersProps) {
  return (
    <div className={styles.option}>
      <div className={styles.actions}>
        <Select
          id={statusId}
          label={text.status}
          value={filters.status}
          onValueChange={(status) => onChange({ ...filters, status })}
          options={[
            { value: ALL, label: text.all },
            ...STATUSES.map((status) => ({ value: status, label: text.statuses[status] })),
          ]}
        />
        <Select
          label={text.format}
          value={filters.format}
          onValueChange={(value) => onChange({ ...filters, format: value })}
          options={[
            { value: ALL, label: text.allFormats },
            ...FORMATS.map((one) => ({ value: one, label: ideasEs.format[one] })),
          ]}
        />
        <Select
          label={text.verdict}
          value={filters.verdict}
          onValueChange={(verdict) => onChange({ ...filters, verdict })}
          options={[
            { value: ALL, label: text.all },
            ...IDEA_VERDICTS.map((verdict) => ({ value: verdict, label: ideasEs.measure.verdict[verdict] })),
            { value: UNMEASURED, label: ideasEs.measure.unmeasured },
          ]}
        />
      </div>
      {/* Always there, so the first filter is said too. */}
      <p role="status" className={styles.why}>
        {hasFilters(filters) ? format(text.shown, { n: number(shown), total: number(total) }) : ''}
      </p>
      {hasFilters(filters) && (
        <div className={styles.actions}>
          <Button
            variant="ghost"
            onClick={() => {
              onChange(NO_FILTERS)
              // The button goes away: the focus goes to the first filter.
              requestAnimationFrame(() => document.getElementById(statusId)?.focus())
            }}
          >
            {text.clear}
          </Button>
        </div>
      )}
    </div>
  )
}

export interface ArchiveProps {
  readonly ideas: readonly IdeaView[]
  readonly busy: boolean
  readonly onRecover: (idea: IdeaView) => void
}

// «Archivadas»: folded, each with «Recuperar». Nothing is deleted (FR-012).
export function Archive({ ideas, busy, onRecover }: ArchiveProps) {
  const archive = ideasEs.archive
  return (
    <Disclosure summary={archive.title}>
      <p className={styles.why}>{archive.why}</p>
      {ideas.length === 0 ? (
        <p>{archive.empty}</p>
      ) : (
        <ul className={styles.options}>
          {ideas.map((idea) => (
            <li key={idea.id} className={styles.option}>
              <h3>{idea.title}</h3>
              <div className={styles.actions}>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={format(ideasEs.measure.named, { accion: ideasEs.moves.recover, titulo: idea.title })}
                  aria-disabled={busy || undefined}
                  onClick={() => !busy && onRecover(idea)}
                >
                  {ideasEs.moves.recover}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Disclosure>
  )
}

// «Descargar como documento» and «Descargar como datos»: the document first, as in the profile (003, FR-026).
export function Downloads({ onDownload }: { onDownload: (format: 'md' | 'json') => void }) {
  const download = ideasEs.download
  return (
    <section aria-labelledby="idea-download-title" className={styles.option}>
      <h2 id="idea-download-title">{download.title}</h2>
      <p className={styles.why}>{download.why}</p>
      <div className={styles.actions}>
        <Button onClick={() => onDownload('md')}>{download.document}</Button>
        <Button onClick={() => onDownload('json')}>{download.data}</Button>
      </div>
    </section>
  )
}
