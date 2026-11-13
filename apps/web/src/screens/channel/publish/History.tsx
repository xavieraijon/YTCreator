import { formatChapterTime, type PackageKind, type PieceFieldValue, type PieceItemChange } from '@ytcreator/core'
import type { PackageVersionDetail, PackageVersionSummary, PackageView } from '@ytcreator/core/api'
import { Badge, Button, Card, DataSource, Disclosure, ErrorMessage, format } from '@ytcreator/ui'
import { useEffect, useRef, useState } from 'react'
import { packagesApi } from '../../../api/client.ts'
import { errorText } from '../../../shell/errorText.ts'
import { formatDate } from '../../../shell/statusText.ts'
import { es } from '../../../strings/es.ts'
import { publishEs } from '../../../strings/publish.es.ts'
import { scriptEs } from '../../../strings/script.es.ts'
import styles from '../channel.module.css'

const text = publishEs.history

type Named = keyof typeof text.names

function nameOf(kind: PackageKind, item: PieceItemChange): string {
  if (item.title !== '') return item.title
  if (kind === 'descripcion') return text.names[item.id as Named] ?? item.id
  return text.names[kind as Named] ?? ''
}

/** What a value says to the creator: the title of a block, not its id; «sin elegir», not an empty role. */
function valueOf(pkg: PackageView, { field, value }: PieceFieldValue): string {
  const blockTitle = (id: string) => {
    const block = pkg.script.blocks.find((one) => one.id === id)
    return block ? block.title || scriptEs.outline.types[block.type] : text.blockGone
  }
  switch (field) {
    case 'role':
      return value === 'principal'
        ? text.roles.principal
        : value === 'alternativa'
          ? text.roles.alternativa
          : text.roles.none
    case 'chosen':
      return value === '' ? text.chosen.no : text.chosen.yes
    case 'start':
      return value === '' ? text.startAuto : formatChapterTime(Number(value))
    default:
      if (value === '') return text.empty
      if (field === 'block') return blockTitle(value)
      if (field === 'blocks') return value.split(',').map(blockTitle).join(', ')
      if (field === 'forTitle')
        return pkg.pieces.titulos?.content.candidates.find((one) => one.id === value)?.text ?? text.titleGone
      return value
  }
}

function Fields({
  pkg,
  label,
  fields,
}: {
  readonly pkg: PackageView
  readonly label?: string
  readonly fields: readonly PieceFieldValue[] | null
}) {
  if (!fields || fields.length === 0) return null
  return (
    <>
      {label && <p className={styles.notice}>{label}</p>}
      {fields.map((field) => (
        <p key={field.field}>
          <strong>{text.fields[field.field]}</strong>{' '}
          {/* As it is copied: its own lines, and a long link that breaks instead of widening the page. */}
          <span className={styles.assembled}>{valueOf(pkg, field)}</span>
        </p>
      ))}
    </>
  )
}

function Comparison({
  pkg,
  kind,
  detail,
}: {
  readonly pkg: PackageView
  readonly kind: PackageKind
  readonly detail: PackageVersionDetail
}) {
  const { changes, orderChanged } = detail.comparison
  const nothing = !orderChanged && changes.every((one) => one.change === 'igual')
  return (
    <>
      {nothing && <p>{text.noChanges}</p>}
      {orderChanged && <p className={styles.notice}>{text.otherOrder}</p>}
      <ul className={styles.options}>
        {changes.map((one) => (
          <Card as="li" key={one.id}>
            <h4>
              <Badge>{text.changes[one.change]}</Badge> {nameOf(kind, one)}
            </h4>
            {/* What the AI proposed is marked as its opinion here too, item by item (principle II). */}
            {one.fromAi && <DataSource kind="ia" />}
            {one.change === 'cambiado' ? (
              <>
                <Fields pkg={pkg} label={text.then} fields={one.before} />
                <Fields pkg={pkg} label={text.now} fields={one.after} />
              </>
            ) : (
              <Fields pkg={pkg} fields={one.change === 'quitado' ? one.before : one.after} />
            )}
          </Card>
        ))}
      </ul>
    </>
  )
}

export interface HistoryProps {
  readonly pkg: PackageView
  readonly kind: PackageKind
  /** Something is being written or asked for: going back would step on it. */
  readonly busy: boolean
  readonly onChange: (pkg: PackageView) => void
  readonly onError: (cause: unknown) => void
}

// Every version stays: going back to one copies it as the newest (SC-008). Same behaviour as the history of 005.
export function History({ pkg, kind, busy, onChange, onError }: HistoryProps) {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<readonly PackageVersionSummary[] | null>(null)
  const [failed, setFailed] = useState<unknown>(null)
  const [attempt, setAttempt] = useState(0)
  const [selected, setSelected] = useState<PackageVersionDetail | null>(null)
  // The version it came from and the one that made: the note goes once something else is written.
  const [restored, setRestored] = useState<{ from: number; at: number } | null>(null)
  const [seeing, setSeeing] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const backTo = useRef<number | null>(null)
  const comparison = useRef<HTMLDivElement>(null)
  const note = useRef<HTMLParagraphElement>(null)
  // A comparison asked for before the piece changed compares with a version that is no longer the current one.
  const currentNow = useRef<number | null>(null)
  const { id } = pkg
  const current = pkg.pieces[kind]?.version ?? null
  const part = publishEs.parts[kind]

  useEffect(() => {
    if (!open || current === null) return
    const controller = new AbortController()
    packagesApi
      .versions(id, kind, { signal: controller.signal })
      .then((got) => {
        setVersions(got)
        setFailed(null)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setFailed(cause)
      })
    return () => controller.abort()
  }, [open, id, kind, current, attempt])

  // What was compared was the version that used to be the current one.
  useEffect(() => {
    currentNow.current = current
    setSelected(null)
  }, [current])

  // The button that had the focus has gone.
  useEffect(() => {
    if (restored !== null) note.current?.focus()
  }, [restored])

  useEffect(() => {
    if (selected) comparison.current?.focus()
    else if (backTo.current !== null) {
      document.querySelector<HTMLElement>(`[data-version-see="${kind}-${backTo.current}"]`)?.focus()
      backTo.current = null
    }
  }, [selected, kind])

  if (current === null) return null

  const see = async (version: number) => {
    setRestored(null)
    setSeeing(version)
    try {
      const asked = current
      const detail = await packagesApi.version(id, kind, version)
      if (currentNow.current === asked) setSelected(detail)
    } catch (cause) {
      onError(cause)
    } finally {
      setSeeing(null)
    }
  }

  const close = () => {
    backTo.current = selected?.version.version ?? null
    setSelected(null)
  }

  const restore = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const from = selected.version.version
      const view = await packagesApi.restore(id, kind, from, { baseVersion: current })
      onChange(view)
      setSelected(null)
      setRestored({ from, at: view.pieces[kind]?.version ?? current })
    } catch (cause) {
      onError(cause)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Disclosure summary={format(text.title, { parte: part })} open={open} onOpenChange={setOpen}>
      {failed !== null && (
        <ErrorMessage
          live
          title={errorText(failed)}
          action={{ label: es.app.retry, onClick: () => setAttempt((n) => n + 1) }}
        />
      )}
      {versions === null && failed === null && <p role="status">{es.app.loading}</p>}
      {restored !== null && restored.at === current && (
        <p role="status" tabIndex={-1} ref={note}>
          {format(text.restored, { n: restored.from })}
        </p>
      )}
      {versions !== null && (
        <ul className={styles.options}>
          {versions.map((version) => {
            const isCurrent = version.version === current
            const isSelected = selected?.version.version === version.version
            return (
              <li key={version.version}>
                <p>
                  {format(version.restoredFrom === null ? text.line : text.lineFrom, {
                    version: format(text.version, { n: version.version }),
                    origen: text.origins[version.origin],
                    fecha: formatDate(version.createdAt),
                    copia: version.restoredFrom === null ? '' : format(text.from, { n: version.restoredFrom }),
                  })}{' '}
                  {isCurrent && <Badge>{text.current}</Badge>}
                </p>
                {!isCurrent && !isSelected && (
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-label={format(text.seeNamed, { n: version.version, parte: part })}
                    data-version-see={`${kind}-${version.version}`}
                    loading={seeing === version.version}
                    disabled={seeing !== null}
                    onClick={() => void see(version.version)}
                  >
                    {text.see}
                  </Button>
                )}
                {isSelected && selected && (
                  <div
                    ref={comparison}
                    role="group"
                    tabIndex={-1}
                    aria-label={format(text.comparison, { n: version.version })}
                  >
                    <Comparison pkg={pkg} kind={kind} detail={selected} />
                    <div className={styles.actions}>
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={saving}
                        disabled={busy}
                        onClick={() => void restore()}
                      >
                        {text.restore}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={close}>
                        {text.close}
                      </Button>
                    </div>
                    {busy && <p className={styles.notice}>{text.busy}</p>}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Disclosure>
  )
}
