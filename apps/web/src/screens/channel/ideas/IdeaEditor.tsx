import { IDEA_FORMATS, IDEA_LIMITS, type IdeaFormat } from '@ytcreator/core'
import type { IdeaView, NewIdeaBody } from '@ytcreator/core/api'
import { Button, Disclosure, RadioGroup, Select, TextArea, TextField } from '@ytcreator/ui'
import { useState, type FormEvent } from 'react'
import { ideasEs } from '../../../strings/ideas.es.ts'
import styles from '../channel.module.css'

const text = ideasEs.editor
// Radix Select shows its placeholder for an empty value: «none» needs a value of its own.
const NO_PILLAR = 'ninguno'

export interface IdeaEditorProps {
  /** The pillars of the profile: an idea of the creator's may name one, or none. */
  readonly pillars: readonly string[]
  /** The idea to change; without it, a new one. */
  readonly idea?: IdeaView
  /** The format a new idea starts with: a channel of only Shorts starts with «Short». */
  readonly defaultFormat?: IdeaFormat
  readonly busy: boolean
  readonly onSave: (body: NewIdeaBody & { notes?: string }) => void
  readonly onCancel?: () => void
}

const orNull = (value: string) => (value.trim() === '' ? null : value.trim())

// «Escribir una idea mía» and «Cambiar algo»: title and format are enough; the searches go in «Modo experto».
export function IdeaEditor({ pillars, idea, defaultFormat = 'largo', busy, onSave, onCancel }: IdeaEditorProps) {
  const [title, setTitle] = useState(idea?.title ?? '')
  const [format, setFormat] = useState<IdeaFormat>(idea?.format ?? defaultFormat)
  const [hook, setHook] = useState(idea?.hook ?? '')
  const [pillar, setPillar] = useState(idea?.pillar ?? NO_PILLAR)
  const [notes, setNotes] = useState(idea?.notes ?? '')
  const [query, setQuery] = useState(idea?.query ?? '')
  const [broadQuery, setBroadQuery] = useState(idea?.broadQuery ?? '')
  const [queryEn, setQueryEn] = useState(idea?.queryEn ?? '')

  // A pillar the profile no longer has (or written another way) is still offered, so what shows is what is saved.
  const pillarOptions = idea?.pillar && !pillars.includes(idea.pillar) ? [...pillars, idea.pillar] : pillars

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (title.trim() === '') return
    onSave({
      title: title.trim(),
      format,
      hook: hook.trim(),
      pillar: pillar === NO_PILLAR ? null : pillar,
      query: orNull(query),
      broadQuery: orNull(broadQuery),
      queryEn: orNull(queryEn),
      ...(idea ? { notes } : {}),
    })
  }

  return (
    <form className={styles.option} onSubmit={submit}>
      <TextField
        label={text.title}
        description={text.titleHelp}
        required
        maxLength={IDEA_LIMITS.title}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <RadioGroup
        label={text.format}
        options={IDEA_FORMATS.map((value) => ({ value, label: ideasEs.format[value] }))}
        value={format}
        onValueChange={(value) => setFormat(value as IdeaFormat)}
      />
      <TextArea
        label={text.hook}
        description={text.hookHelp}
        optional
        rows={2}
        maxLength={IDEA_LIMITS.hook}
        value={hook}
        onChange={(event) => setHook(event.target.value)}
      />
      <Select
        label={text.pillar}
        optional
        options={[
          { value: NO_PILLAR, label: text.noPillar },
          ...pillarOptions.map((value) => ({ value, label: value })),
        ]}
        value={pillar}
        onValueChange={setPillar}
      />
      {idea && (
        <TextArea
          label={text.notes}
          description={text.notesHelp}
          optional
          rows={3}
          maxLength={IDEA_LIMITS.notes}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      )}
      <Disclosure summary={text.expert}>
        <p className={styles.why}>{text.expertWhy}</p>
        <TextField
          label={text.query}
          optional
          maxLength={IDEA_LIMITS.query}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <TextField
          label={text.broadQuery}
          optional
          maxLength={IDEA_LIMITS.query}
          value={broadQuery}
          onChange={(event) => setBroadQuery(event.target.value)}
        />
        <TextField
          label={text.queryEn}
          optional
          maxLength={IDEA_LIMITS.query}
          value={queryEn}
          onChange={(event) => setQueryEn(event.target.value)}
        />
      </Disclosure>
      <div className={styles.actions}>
        <Button type="submit" loading={busy} disabled={title.trim() === ''}>
          {idea ? text.saveChanges : text.save}
        </Button>
        {onCancel && (
          <Button variant="ghost" disabled={busy} onClick={onCancel}>
            {text.cancel}
          </Button>
        )}
      </div>
    </form>
  )
}
