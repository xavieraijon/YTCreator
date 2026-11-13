import {
  type ChaptersContent,
  emptyPiece,
  type PackageKind,
  parseChapterTime,
  formatChapterTime,
  PUBLISH_LIMITS,
  stepKinds,
} from '@ytcreator/core'
import type { PackageView } from '@ytcreator/core/api'
import { Button, Card, DataSource, ErrorMessage, format, TextArea, TextField } from '@ytcreator/ui'
import { useState } from 'react'
import { packagesApi } from '../../../api/client.ts'
import { navigate } from '../../../router.ts'
import { errorText } from '../../../shell/errorText.ts'
import { es } from '../../../strings/es.ts'
import { publishEs } from '../../../strings/publish.es.ts'
import styles from '../channel.module.css'
import { AiAction } from '../Proposal.tsx'
import { coverApproved } from './CoverStep.tsx'
import { AskAgain, type AskAgainProps } from './AskAgain.tsx'
import { History } from './History.tsx'
import { type PackageAi, type PackageOp, usePackageEstimate } from './usePackageAi.ts'

const text = publishEs.texts

export interface DescriptionStepProps {
  readonly pkg: PackageView
  readonly ai: PackageAi
  readonly onChange: (pkg: PackageView) => void
  readonly onError: (cause: unknown) => void
  readonly onNext: () => void
}

/** What the creator is writing, started again from the piece each time the piece gets a new version. */
function useDraft<T>(make: () => T, version: number | null) {
  const [value, setValue] = useState(make)
  const [seen, setSeen] = useState(version)
  if (seen !== version) {
    setSeen(version)
    setValue(make())
  }
  return [value, setValue] as const
}

interface ChapterRow {
  readonly id: string
  readonly title: string
  readonly blockIds: readonly string[]
  /** What the creator wrote as the minute; empty while it is worked out from the script. */
  readonly time: string
}

const rowsOf = (content: ChaptersContent | undefined): ChapterRow[] =>
  (content?.chapters ?? []).map((chapter, index) => ({
    id: chapter.id,
    title: chapter.title,
    blockIds: chapter.blockIds,
    time: index > 0 && chapter.manual && chapter.startSeconds !== null ? formatChapterTime(chapter.startSeconds) : '',
  }))

const chaptersOf = (rows: readonly ChapterRow[]): ChaptersContent => ({
  chapters: rows.map((row, index) => {
    const seconds = index === 0 ? null : parseChapterTime(row.time)
    return {
      id: row.id,
      title: row.title.trim(),
      blockIds: [...row.blockIds],
      startSeconds: seconds,
      manual: seconds !== null,
    }
  }),
})

// What the AI wrote, at first or asked for again, carries its mark (principle II).
const fromAi = (piece: { origin: string }) => piece.origin === 'ia' || piece.origin === 'parte_ia'

const tagsOf = (written: string) => [
  ...new Set(
    written
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag !== ''),
  ),
]

// A Short's hashtags, written as the creator would: with or without «#», by commas or spaces. Stored without «#».
const hashtagsOf = (written: string) => [
  ...new Set(
    written
      .split(/[\s,]+/)
      .map((tag) => tag.replace(/^#+/, ''))
      .filter((tag) => tag !== ''),
  ),
]
const hashtagsText = (hashtags: readonly string[]) => hashtags.map((tag) => `#${tag}`).join(' ')

// «Descripción»: the text under the video, its chapters, the tags and the pinned comment (contracts/ui-screens.md).
export function DescriptionStep({ pkg, ai, onChange, onError, onNext }: DescriptionStepProps) {
  const { descripcion: description, capitulos, etiquetas, comentario } = pkg.pieces
  const scriptApproved = pkg.script.status === 'guion_aprobado'
  const cover = coverApproved(pkg)
  const [asking, setAsking] = useState(false)
  const [saving, setSaving] = useState(false)
  const idle = ai.working === null && !asking
  const busy = saving || !idle
  const isShort = pkg.format === 'short'
  const kinds = stepKinds(pkg.format, 'textos')
  // A Short has no chapters; its texts come with its package (R9).
  const missing = kinds.some((kind) => pkg.pieces[kind] === null)
  const firstPrice = usePackageEstimate(pkg, 'descripcion', !isShort && scriptApproved && cover && idle && missing)

  const [firstLines, setFirstLines] = useDraft(
    () => description?.content.firstLines ?? '',
    description?.version ?? null,
  )
  const [body, setBody] = useDraft(() => description?.content.body ?? '', description?.version ?? null)
  const [rows, setRows] = useDraft(() => rowsOf(capitulos?.content), capitulos?.version ?? null)
  const [tags, setTags] = useDraft(() => (etiquetas?.content.tags ?? []).join(', '), etiquetas?.version ?? null)
  const [comment, setComment] = useDraft(() => comentario?.content.text ?? '', comentario?.version ?? null)
  const [hashtags, setHashtags] = useDraft(
    () => hashtagsText(description?.content.hashtags ?? []),
    description?.version ?? null,
  )

  if (isShort && missing) return <p className={styles.notice}>{text.shortNeedsPackage}</p>
  if (!cover && description === null) return <p className={styles.notice}>{text.needsCover}</p>

  const saved = async (work: () => Promise<PackageView>) => {
    setSaving(true)
    try {
      onChange(await work())
      return true
    } catch (cause) {
      onError(cause)
      return false
    } finally {
      setSaving(false)
    }
  }
  const save = (kind: PackageKind, baseVersion: number, content: unknown) =>
    saved(() => packagesApi.savePiece(pkg.id, kind, { baseVersion, content }))

  const ask = async (op: PackageOp, price: ReturnType<typeof usePackageEstimate>, instructions?: string) => {
    setAsking(true)
    try {
      await ai.run(op, price, instructions)
    } finally {
      setAsking(false)
    }
  }

  if (missing || description === null || etiquetas === null || comentario === null) {
    return (
      <section aria-labelledby="texts-title">
        <h2 id="texts-title">{publishEs.screen.steps.textos}</h2>
        <p className={styles.why}>{publishEs.screen.why.textos}</p>
        <p>{text.askWhy}</p>
        {firstPrice.error !== null && (
          <ErrorMessage
            live
            title={errorText(firstPrice.error)}
            action={{ label: es.app.retry, onClick: firstPrice.retry }}
          />
        )}
        <AiAction
          label={text.ask}
          estimate={firstPrice.estimate}
          failure={ai.failureFor('descripcion')}
          busy={ai.working === 'descripcion'}
          disabled={busy || !scriptApproved || !cover}
          onRun={() => void ask('descripcion', firstPrice)}
        />
      </section>
    )
  }

  const hashtagsSent = hashtagsOf(hashtags)
  const hashtagsWrong =
    hashtagsSent.length > PUBLISH_LIMITS.hashtags ||
    hashtagsSent.some((tag) => tag.length > PUBLISH_LIMITS.hashtag || tag.includes('#'))
  const descriptionDirty =
    firstLines !== description.content.firstLines ||
    body !== description.content.body ||
    (isShort && hashtagsSent.join('\n') !== description.content.hashtags.join('\n'))
  const chaptersSent = chaptersOf(rows)
  const chaptersDirty =
    capitulos !== null && JSON.stringify(chaptersSent) !== JSON.stringify(chaptersOf(rowsOf(capitulos.content)))
  // Each start as it would be saved: the minute written, or the estimate there is now.
  const startOfRow = (row: ChapterRow, index: number) =>
    index === 0
      ? 0
      : (parseChapterTime(row.time) ?? pkg.texts.chapters.find((one) => one.id === row.id)?.startSeconds ?? null)
  const timeError = (row: ChapterRow, index: number) => {
    if (index === 0 || row.time.trim() === '') return undefined
    const start = parseChapterTime(row.time)
    if (start === null) return text.timeInvalid
    const before = startOfRow(rows[index - 1]!, index - 1)
    return before !== null && start <= before ? text.timeOrder : undefined
  }
  const badTime = rows.some((row, index) => timeError(row, index) !== undefined)
  const tagsSent = tagsOf(tags)
  const tagsWrong = tagsSent.length > PUBLISH_LIMITS.tags || tagsSent.some((tag) => tag.length > PUBLISH_LIMITS.tag)
  const tagsDirty = tagsSent.join('\n') !== etiquetas.content.tags.join('\n')
  const commentDirty = comment !== comentario.content.text
  const dirty = descriptionDirty || chaptersDirty || tagsDirty || commentDirty

  const versions = Object.fromEntries(kinds.map((kind) => [kind, pkg.pieces[kind]?.version ?? 0]))
  const approvedTexts = pkg.approvals.texts
  const approved = cover && approvedTexts !== null && kinds.every((kind) => approvedTexts[kind] === versions[kind])
  const ready = kinds.every((kind) => {
    const piece = pkg.pieces[kind]
    return piece !== null && !emptyPiece(kind, piece.content)
  })
  const fixedChanged = pkg.warnings.includes('parte_fija_cambiada')
  const assembled = pkg.texts.assembled ?? ''
  const max = pkg.limits.descriptionMaxChars
  const askProps = {
    pkg,
    ai,
    disabled: busy || dirty || !scriptApproved || !cover,
    onAsk: (...args: Parameters<AskAgainProps['onAsk']>) => void ask(...args),
  }

  const historyProps = { pkg, onChange, onError }

  const setRow = (index: number, change: Partial<ChapterRow>) =>
    setRows(rows.map((row, at) => (at === index ? { ...row, ...change } : row)))

  return (
    <section aria-labelledby="texts-title">
      <h2 id="texts-title">{publishEs.screen.steps.textos}</h2>
      <p className={styles.why}>{publishEs.screen.why.textos}</p>
      {!cover && <p className={styles.notice}>{isShort ? text.needsCoverShort : text.needsCover}</p>}
      {/* The app does not know the long video's address: the creator links it when uploading (R9, decision 10). */}
      {isShort && pkg.parentTitle !== null && (
        <p className={styles.notice}>{format(text.related, { titulo: pkg.parentTitle })}</p>
      )}

      <Card className={styles.form}>
        <h3>{text.assembled}</h3>
        <p className={styles.assembled}>{assembled}</p>
        <p>
          {format(text.assembledChars, { n: assembled.length, max })}
          {assembled.length > max && <span>{format(text.assembledTooLong, { max })}</span>}
        </p>
        <DataSource kind="conocimiento" label={pkg.limits.youtube.label} date={pkg.limits.youtube.date} />
      </Card>

      <div className={styles.form}>
        <h3>{text.descriptionText}</h3>
        <TextArea
          label={text.firstLines}
          description={text.firstLinesHint}
          value={firstLines}
          maxLength={PUBLISH_LIMITS.firstLines}
          disabled={busy}
          onChange={(event) => setFirstLines(event.target.value)}
        />
        <TextArea
          label={text.body}
          description={text.bodyHint}
          value={body}
          maxLength={PUBLISH_LIMITS.body}
          disabled={busy}
          onChange={(event) => setBody(event.target.value)}
        />
        {isShort && (
          <>
            <TextField
              label={text.hashtags}
              description={format(text.hashtagsHint, { n: pkg.limits.hashtagsShown })}
              error={
                hashtagsWrong
                  ? format(text.hashtagsWrong, { max: PUBLISH_LIMITS.hashtags, largo: PUBLISH_LIMITS.hashtag })
                  : undefined
              }
              value={hashtags}
              disabled={busy}
              onChange={(event) => setHashtags(event.target.value)}
            />
            <DataSource kind="conocimiento" label={pkg.limits.hashtags.label} date={pkg.limits.hashtags.date} />
          </>
        )}
        {fromAi(description) && <DataSource kind="ia" />}
        <div className={styles.actions}>
          <Button
            aria-label={format(text.saveNamed, { parte: publishEs.parts.descripcion })}
            variant="secondary"
            loading={saving}
            disabled={busy || !descriptionDirty || hashtagsWrong}
            onClick={() =>
              void save('descripcion', description.version, {
                ...description.content,
                firstLines,
                body,
                ...(isShort ? { hashtags: hashtagsSent } : {}),
              })
            }
          >
            {text.save}
          </Button>
        </div>
        <AskAgain {...askProps} part="descripcion" />
        <History {...historyProps} kind="descripcion" busy={busy || descriptionDirty} />
      </div>

      {capitulos !== null && (
        <>
          <div className={styles.form}>
            <h3>{text.chapters}</h3>
            <p className={styles.why}>{text.chaptersWhy}</p>
            <p className={styles.notice}>{text.adjustLater}</p>
            <ol className={styles.options}>
              {rows.map((row, index) => {
                const n = index + 1
                const estimate = pkg.texts.chapters.find((one) => one.id === row.id)
                const wrong = timeError(row, index)
                return (
                  <li key={row.id} className={styles.option}>
                    <TextField
                      label={format(text.chapterName, { n })}
                      value={row.title}
                      maxLength={PUBLISH_LIMITS.chapterTitle}
                      disabled={busy}
                      onChange={(event) => setRow(index, { title: event.target.value })}
                    />
                    {index === 0 ? (
                      <p>{text.firstAtZero}</p>
                    ) : (
                      <TextField
                        label={format(text.chapterTime, { n })}
                        description={
                          estimate && !estimate.manual
                            ? format(text.chapterTimeEstimated, { tiempo: estimate.time })
                            : text.chapterTimeHint
                        }
                        error={wrong}
                        value={row.time}
                        disabled={busy}
                        onChange={(event) => setRow(index, { time: event.target.value })}
                      />
                    )}
                  </li>
                )
              })}
            </ol>
            <div className={styles.actions}>
              <Button
                aria-label={format(text.saveNamed, { parte: publishEs.parts.capitulos })}
                variant="secondary"
                loading={saving}
                disabled={busy || !chaptersDirty || badTime || rows.some((row) => row.title.trim() === '')}
                onClick={() => void save('capitulos', capitulos.version, chaptersSent)}
              >
                {text.save}
              </Button>
            </div>
            {fromAi(capitulos) && <DataSource kind="ia" />}
            <AskAgain {...askProps} part="capitulos" />
            <History {...historyProps} kind="capitulos" busy={busy || chaptersDirty} />
          </div>
        </>
      )}

      <div className={styles.form}>
        <h3>{text.sources}</h3>
        <p className={styles.why}>{text.sourcesWhy}</p>
        {pkg.texts.sources.length > 0 && (
          <ul>
            {pkg.texts.sources.map((source) => (
              <li key={source.url ?? source.reference ?? source.title}>
                {source.url === null
                  ? source.reference
                  : source.title
                    ? format(text.sourceLine, { titulo: source.title, enlace: source.url })
                    : source.url}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={styles.form}>
        <h3>{text.fixed}</h3>
        <p className={styles.why}>{text.fixedWhy}</p>
        <p className={styles.assembled}>{description.content.fixedText || text.fixedEmpty}</p>
        {fixedChanged && (
          <>
            <p className={styles.notice}>{text.fixedChanged}</p>
            <p className={styles.assembled}>{pkg.texts.fixedText.current || text.fixedEmpty}</p>
          </>
        )}
        <div className={styles.actions}>
          {fixedChanged && (
            <Button
              variant="secondary"
              loading={saving}
              disabled={busy || descriptionDirty}
              onClick={() =>
                void save('descripcion', description.version, {
                  ...description.content,
                  fixedText: pkg.texts.fixedText.current,
                })
              }
            >
              {text.useNew}
            </Button>
          )}
          <Button variant="ghost" onClick={() => navigate({ page: 'publishSettings' })}>
            {text.toSettings}
          </Button>
        </div>
      </div>

      <div className={styles.form}>
        <h3>{text.tags}</h3>
        <p className={styles.why}>{text.tagsWhy}</p>
        <TextArea
          label={text.tagsField}
          description={format(text.tagsHint, { n: PUBLISH_LIMITS.tags, max: PUBLISH_LIMITS.tag })}
          error={tagsWrong ? format(text.tagsHint, { n: PUBLISH_LIMITS.tags, max: PUBLISH_LIMITS.tag }) : undefined}
          value={tags}
          disabled={busy}
          onChange={(event) => setTags(event.target.value)}
        />
        <div className={styles.actions}>
          <Button
            aria-label={format(text.saveNamed, { parte: publishEs.parts.etiquetas })}
            variant="secondary"
            loading={saving}
            disabled={busy || !tagsDirty || tagsWrong}
            onClick={() => void save('etiquetas', etiquetas.version, { tags: tagsSent })}
          >
            {text.save}
          </Button>
        </div>
        {fromAi(etiquetas) && <DataSource kind="ia" />}
        <AskAgain {...askProps} part="etiquetas" />
        <History {...historyProps} kind="etiquetas" busy={busy || tagsDirty} />
      </div>

      <div className={styles.form}>
        <h3>{text.comment}</h3>
        <p className={styles.why}>{text.commentWhy}</p>
        <TextArea
          label={text.comment}
          value={comment}
          maxLength={PUBLISH_LIMITS.comment}
          disabled={busy}
          onChange={(event) => setComment(event.target.value)}
        />
        <div className={styles.actions}>
          <Button
            aria-label={format(text.saveNamed, { parte: publishEs.parts.comentario })}
            variant="secondary"
            loading={saving}
            disabled={busy || !commentDirty}
            onClick={() => void save('comentario', comentario.version, { text: comment })}
          >
            {text.save}
          </Button>
        </div>
        {fromAi(comentario) && <DataSource kind="ia" />}
        <AskAgain {...askProps} part="comentario" />
        <History {...historyProps} kind="comentario" busy={busy || commentDirty} />
      </div>

      {approved ? (
        <>
          <p role="status">{text.approved}</p>
          <div className={styles.actions}>
            <Button variant="primary" onClick={onNext}>
              {text.toReview}
            </Button>
          </div>
        </>
      ) : (
        <>
          {dirty ? (
            <p className={styles.notice}>{text.unsaved}</p>
          ) : (
            !ready && <p className={styles.notice}>{isShort ? text.notReadyShort : text.notReady}</p>
          )}
          <div className={styles.actions}>
            <Button
              variant="primary"
              loading={saving}
              disabled={busy || dirty || !ready || !cover || !scriptApproved}
              onClick={() => void saved(() => packagesApi.approve(pkg.id, { step: 'textos', versions }))}
            >
              {text.approve}
            </Button>
          </div>
        </>
      )}
    </section>
  )
}
