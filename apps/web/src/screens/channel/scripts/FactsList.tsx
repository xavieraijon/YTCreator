import { type Fact, type LinkState, SCRIPT_LIMITS, type ScriptSource } from '@ytcreator/core'
import type { ScriptView } from '@ytcreator/core/api'
import { Badge, Button, Card, DataSource, Dialog, ErrorMessage, format, TextArea, TextField } from '@ytcreator/ui'
import { useRef, useState } from 'react'
import { ApiClientError, scriptsApi } from '../../../api/client.ts'
import { errorText } from '../../../shell/errorText.ts'
import { ExternalLink } from '../../../shell/ExternalLink.tsx'
import { formatDate } from '../../../shell/statusText.ts'
import { scriptEs } from '../../../strings/script.es.ts'
import styles from '../channel.module.css'

const text = scriptEs.facts

const TONES = { comprobado: 'success', una_fuente: 'warning', sin_confirmar: 'danger', del_creador: 'neutral' } as const

const isLink = (value: string) => {
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, '')

export function SourceLine({ source }: { readonly source: ScriptSource }) {
  const state: LinkState | null = source.link
  // The site it really goes to, whatever the title says.
  const host = source.url ? hostOf(source.url) : null
  return (
    <li>
      {source.url ? <ExternalLink href={source.url}>{source.title || host}</ExternalLink> : source.reference}
      {host && source.title && source.title !== host && ` (${host})`}
      {source.url && source.reference && ` · ${source.reference}`}{' '}
      {format(text.consulted, { fecha: formatDate(source.accessedAt) })}
      {state !== null && state !== 'abre' && <strong> {text.link[state]}</strong>}
    </li>
  )
}

interface Problem {
  readonly title: string
  readonly action: { readonly label: string; readonly onClick: () => void }
}

function FactDialog({
  fact,
  busy,
  error,
  onSave,
  onClose,
}: {
  readonly fact: Fact | null
  readonly busy: boolean
  readonly error: Problem | null
  readonly onSave: (written: string, sources: ScriptSource[]) => void
  readonly onClose: () => void
}) {
  const [written, setWritten] = useState(fact?.text ?? '')
  const [sources, setSources] = useState(fact?.sources ?? [])
  const [link, setLink] = useState('')
  const [reference, setReference] = useState('')
  const badLink = link.trim() !== '' && !isLink(link.trim())

  const withNew = (): ScriptSource[] => {
    const url = link.trim()
    const named = reference.trim()
    if (url === '' && named === '') return sources
    return [
      ...sources,
      {
        id: crypto.randomUUID(),
        url: url === '' ? null : url,
        reference: named === '' ? null : named,
        title: url === '' ? '' : hostOf(url),
        accessedAt: new Date().toISOString(),
        link: null,
      },
    ]
  }
  const tooMany = !badLink && withNew().length > SCRIPT_LIMITS.factSources
  const usable = !badLink && !tooMany && (written.trim() !== '' || withNew().length > 0)

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={fact ? text.editTitle : text.addTitle}
      description={text.addHelp}
    >
      <form
        className={styles.options}
        onSubmit={(event) => {
          event.preventDefault()
          if (usable) onSave(written.trim(), withNew())
        }}
      >
        <TextArea
          label={text.factText}
          value={written}
          rows={3}
          maxLength={SCRIPT_LIMITS.factText}
          onChange={(event) => setWritten(event.target.value)}
        />
        {sources.length > 0 && (
          <ul>
            {sources.map((source) => (
              <li key={source.id}>
                {source.url ?? source.reference}{' '}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={format(text.removeSourceNamed, { texto: source.url ?? source.reference ?? '' })}
                  onClick={() => setSources((list) => list.filter((one) => one.id !== source.id))}
                >
                  {text.remove}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <TextField
          label={text.sourceLink}
          value={link}
          inputMode="url"
          maxLength={SCRIPT_LIMITS.sourceUrl}
          error={
            badLink
              ? text.badLink
              : tooMany
                ? format(text.tooManySources, { max: String(SCRIPT_LIMITS.factSources) })
                : undefined
          }
          onChange={(event) => setLink(event.target.value)}
        />
        <TextField
          label={text.sourceReference}
          value={reference}
          maxLength={SCRIPT_LIMITS.reference}
          onChange={(event) => setReference(event.target.value)}
        />
        {error !== null && <ErrorMessage live title={error.title} action={error.action} />}
        <div className={styles.actions}>
          <Button type="submit" variant="primary" loading={busy} disabled={!usable}>
            {text.save}
          </Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            {text.cancel}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export interface FactsListProps {
  readonly script: ScriptView
  readonly locked: boolean
  readonly onChange: (script: ScriptView) => void
}

// The list everything is written from: what the AI found, what the creator adds, and how sure each thing is.
export function FactsList({ script, locked, onChange }: FactsListProps) {
  const facts = script.facts?.content.facts ?? []
  const [dialog, setDialog] = useState<'nuevo' | string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  const editing = facts.find((fact) => fact.id === dialog) ?? null

  const save = async (next: Fact[]): Promise<boolean> => {
    setSaving(true)
    setError(null)
    try {
      onChange(
        await scriptsApi.saveFacts(script.id, { baseVersion: script.facts?.version ?? 0, content: { facts: next } }),
      )
      return true
    } catch (cause) {
      setError(cause)
      return false
    } finally {
      setSaving(false)
    }
  }

  // The dialog stays open: what was being written is not lost, and the next save goes on top of the latest.
  const takeLatest = async () => {
    try {
      onChange(await scriptsApi.get(script.id))
      setError(null)
    } catch (cause) {
      setError(cause)
    }
  }

  const conflict = error instanceof ApiClientError && error.body?.code === 'version_cambiada'
  const problem: Problem | null =
    error === null
      ? null
      : conflict
        ? { title: text.listConflict, action: { label: text.seeLatest, onClick: () => void takeLatest() } }
        : { title: errorText(error), action: { label: text.understood, onClick: () => setError(null) } }

  const remove = async (id: string) => {
    if (await save(facts.filter((fact) => fact.id !== id))) heading.current?.focus()
  }

  const write = async (written: string, sources: ScriptSource[]) => {
    const next: Fact[] = editing
      ? facts.map((fact) =>
          fact.id === editing.id
            ? { ...fact, text: written, sources, ...(written !== fact.text ? { origin: 'creador' as const } : {}) }
            : fact,
        )
      : [
          ...facts,
          {
            id: crypto.randomUUID(),
            text: written,
            label: 'del_creador',
            origin: 'creador',
            sources,
            alternatives: null,
          },
        ]
    if (await save(next)) setDialog(null)
  }

  const full = facts.length >= SCRIPT_LIMITS.facts
  return (
    <>
      <h2 ref={heading} tabIndex={-1}>
        {text.listTitle}
      </h2>
      {facts.length === 0 ? (
        <p className={styles.notice}>{text.listEmpty}</p>
      ) : (
        <ul className={styles.options}>
          {facts.map((fact) => (
            <li key={fact.id}>
              <Card className={styles.option}>
                <p>
                  <Badge tone={TONES[fact.label]}>{scriptEs.history.labels[fact.label]}</Badge>
                </p>
                {fact.origin === 'ia' && <DataSource kind="ia" />}
                {fact.text && <p>{fact.text}</p>}
                {fact.alternatives && <p>{format(text.alternatives, { texto: fact.alternatives })}</p>}
                {fact.sources.length > 0 ? (
                  <ul>
                    {fact.sources.map((source) => (
                      <SourceLine key={source.id} source={source} />
                    ))}
                  </ul>
                ) : (
                  <p>{text.noSources}</p>
                )}
                <div className={styles.actions}>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={locked || saving}
                    aria-label={format(text.named, { accion: text.change, texto: fact.text || text.thisSource })}
                    onClick={() => setDialog(fact.id)}
                  >
                    {text.change}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={locked || saving}
                    aria-label={format(text.named, { accion: text.remove, texto: fact.text || text.thisSource })}
                    onClick={() => void remove(fact.id)}
                  >
                    {text.remove}
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {facts.length > 0 && <p className={styles.notice}>{text.linkNote}</p>}
      {problem !== null && dialog === null && <ErrorMessage live title={problem.title} action={problem.action} />}
      <div className={styles.actions}>
        <Button variant="secondary" disabled={locked || saving || full} onClick={() => setDialog('nuevo')}>
          {text.add}
        </Button>
      </div>
      {dialog !== null && (
        <FactDialog
          key={dialog}
          fact={editing}
          busy={saving}
          error={problem}
          onSave={(written, sources) => void write(written, sources)}
          onClose={() => {
            setDialog(null)
            setError(null)
          }}
        />
      )}
    </>
  )
}
