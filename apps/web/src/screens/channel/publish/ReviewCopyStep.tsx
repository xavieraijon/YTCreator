import {
  formatKinds,
  type PackageKind,
  type PackageReviewNotice,
  type PieceContents,
  reviewPackage,
  type StudioKey,
  warningNotices,
} from '@ytcreator/core'
import type { PackageReviewRules, PackageView } from '@ytcreator/core/api'
import { Button, Card, Checkbox, DataSource, Dialog, ErrorMessage, format, TextArea, useToast } from '@ytcreator/ui'
import { useEffect, useRef, useState } from 'react'
import { ApiClientError, packagesApi } from '../../../api/client.ts'
import { errorText } from '../../../shell/errorText.ts'
import { es } from '../../../strings/es.ts'
import { publishEs } from '../../../strings/publish.es.ts'
import { saveFile } from '../scripts/saveFile.ts'
import styles from '../channel.module.css'

const text = publishEs.review

export type FixStep = 'portada' | 'textos'

export interface ReviewCopyStepProps {
  readonly pkg: PackageView
  readonly onChange: (pkg: PackageView) => void
  readonly onError: (cause: unknown) => void
  /** Takes the creator to the step where a piece is fixed. */
  readonly onToStep: (step: FixStep) => void
  /** The AI is working on this package: nothing can be approved meanwhile. */
  readonly busy: boolean
}

const stepOf = (kind: PackageKind): FixStep =>
  kind === 'titulos' || kind === 'miniaturas' || kind === 'portada_short' ? 'portada' : 'textos'

// The figure each rule uses, to cite its own source (`GET /packages/:id/review`, `sources`).
const FIGURE_OF: Partial<Record<PackageReviewNotice['rule'], string>> = {
  titulo_largo: 'titleMaxChars',
  titulo_movil: 'mobileTitleChars',
  descripcion_larga: 'descriptionMaxChars',
  capitulos_sin_cero: 'chapterFirstAtZero',
  capitulos_pocos: 'chapterMinCount',
  capitulo_corto: 'chapterMinSeconds',
  etiquetas_largas: 'tagsMaxTotalChars',
  hashtags_muchos: 'hashtagsShown',
}

/** The review as the server counts it: the same function, with the figures it sends (R13, FR-013). */
export function packageNotices(pkg: PackageView, rules: PackageReviewRules['rules']): PackageReviewNotice[] {
  return reviewPackage(
    {
      format: pkg.format,
      pieces: Object.fromEntries(
        formatKinds(pkg.format).map((kind) => [kind, pkg.pieces[kind]?.content ?? null]),
      ) as PieceContents,
      chapters: pkg.texts.chapters,
      scriptSeconds: pkg.script.blocks.reduce((sum, block) => sum + block.seconds, 0),
      assembled: pkg.texts.assembled,
    },
    rules,
  )
}

function noticeText(notice: PackageReviewNotice, pkg: PackageView): string {
  const titles = pkg.pieces.titulos?.content
  const n = notice.value ?? 0
  const max = notice.limit ?? 0
  switch (notice.rule) {
    case 'titulo_largo':
    case 'titulo_movil':
      return format(text.notices[notice.rule], {
        titulo: titles?.candidates.find((one) => one.id === notice.titleId)?.text ?? '',
        n,
        max,
      })
    case 'descripcion_larga':
      return format(text.notices.descripcion_larga, { n, max, sobra: n - max })
    case 'etiquetas_largas':
    case 'hashtags_muchos':
      return format(text.notices[notice.rule], { n, max })
    case 'capitulos_pocos':
      return format(text.notices.capitulos_pocos, { n, min: max })
    case 'capitulo_corto':
      return format(text.notices.capitulo_corto, {
        nombre: pkg.texts.chapters.find((one) => one.id === notice.chapterId)?.title ?? '',
        n,
        min: max,
      })
    case 'miniatura_repite_titulo': {
      const concepts = pkg.pieces.miniaturas?.content.concepts ?? []
      return format(text.notices.miniatura_repite_titulo, {
        n: concepts.findIndex((one) => one.id === notice.conceptId) + 1,
      })
    }
    case 'pieza_vacia':
      return format(text.notices.pieza_vacia, { pieza: text.missing[notice.kind] })
    case 'capitulos_sin_cero':
    case 'sin_parte_fija':
      return text.notices[notice.rule]
  }
}

// A piece as it is pasted into YouTube Studio, with its own «Copiar» (FR-014).
interface Copyable {
  readonly key: string
  readonly name: string
  readonly value: string
}

// The package, ready to copy: notices, pieces in the order of YouTube Studio, its guided list, approval and downloads.
export function ReviewCopyStep({ pkg, onChange, onError, onToStep, busy }: ReviewCopyStepProps) {
  const { toast } = useToast()
  const [rules, setRules] = useState<PackageReviewRules['rules'] | null>(null)
  const [sources, setSources] = useState<PackageReviewRules['sources']>({})
  const [failed, setFailed] = useState<unknown>(null)
  const [attempt, setAttempt] = useState(0)
  const [manual, setManual] = useState<Copyable | null>(null)
  const manualField = useRef<HTMLTextAreaElement>(null)
  const [asking, setAsking] = useState(false)
  const [saving, setSaving] = useState(false)
  // A mark is saved one at a time; the box keeps the focus, it is never turned off (principle VI, decision 32).
  const marking = useRef(false)
  const [countChanged, setCountChanged] = useState(false)
  const [downloadFailed, setDownloadFailed] = useState<{ cause: unknown; kind: 'md' | 'json' | 'brief' } | null>(null)
  const [justApproved, setJustApproved] = useState(false)
  const approvedNote = useRef<HTMLParagraphElement>(null)
  const { id } = pkg

  useEffect(() => {
    const controller = new AbortController()
    packagesApi
      .review(id, { signal: controller.signal })
      .then((got) => {
        setRules(got.rules)
        setSources(got.sources)
        setFailed(null)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setFailed(cause)
      })
    return () => controller.abort()
  }, [id, attempt])

  // Without the clipboard, the text is there selected, so the keyboard copies it (R14).
  useEffect(() => {
    if (manual) manualField.current?.select()
  }, [manual])

  // The button that had the focus has gone: it moves to what took its place.
  useEffect(() => {
    if (justApproved) approvedNote.current?.focus()
  }, [justApproved])

  const notices = rules ? packageNotices(pkg, rules) : []
  const warnings = warningNotices(notices).length + pkg.warnings.length
  const hasEmpty = notices.some((notice) => notice.blocking)
  const scriptApproved = pkg.script.status === 'guion_aprobado'
  const approved = pkg.status === 'aprobado'

  const titles = pkg.pieces.titulos?.content
  const titleText = (titleId: string | null) =>
    titleId === null ? null : (titles?.candidates.find((one) => one.id === titleId)?.text ?? null)
  const mainTitle = titleText(titles?.main ?? null)
  const alternatives = (titles?.alternatives ?? []).flatMap((titleId) => titleText(titleId) ?? [])
  const thumbnails = pkg.pieces.miniaturas?.content
  const chosen = (thumbnails?.chosen ?? []).flatMap((conceptId) => {
    const index = thumbnails?.concepts.findIndex((one) => one.id === conceptId) ?? -1
    return index < 0 ? [] : [{ index, concept: thumbnails!.concepts[index]! }]
  })
  const cover = pkg.pieces.portada_short?.content
  const tags = pkg.pieces.etiquetas?.content.tags ?? []
  const comment = pkg.pieces.comentario?.content.text.trim() ?? ''

  const copy = async (piece: Copyable) => {
    try {
      await navigator.clipboard.writeText(piece.value)
      setManual(null)
      toast({ title: text.copied, description: format(text.copiedNamed, { pieza: piece.name }), tone: 'success' })
    } catch {
      // No permission, or not a secure page (a server without HTTPS): the keyboard copies it.
      setManual(piece)
    }
  }

  const copyBlock = (piece: Copyable) => (
    <>
      <div className={styles.actions}>
        <Button
          variant="secondary"
          size="sm"
          aria-label={format(text.copyNamed, { pieza: piece.name })}
          onClick={() => void copy(piece)}
        >
          {text.copy}
        </Button>
      </div>
      {manual?.key === piece.key && (
        <TextArea
          ref={manualField}
          label={format(text.manualLabel, { pieza: piece.name })}
          description={text.manual}
          value={piece.value}
          readOnly
          autoResize
        />
      )}
    </>
  )

  // A double click on «Aprobar igual» sends one approval, not two.
  const approving = useRef(false)
  const approve = async () => {
    if (approving.current) return
    approving.current = true
    setSaving(true)
    setAsking(false)
    setJustApproved(false)
    setCountChanged(false)
    try {
      const versions = Object.fromEntries(
        formatKinds(pkg.format).flatMap((kind) => {
          const piece = pkg.pieces[kind]
          return piece ? [[kind, piece.version]] : []
        }),
      )
      onChange(await packagesApi.approve(id, { step: 'paquete', versions, acknowledgedWarnings: warnings }))
      setJustApproved(true)
    } catch (cause) {
      // The count or a piece changed elsewhere: what is on screen is read again, with its notices, and then the
      // error says what happened (reading it again clears the error, so it goes first).
      if (cause instanceof ApiClientError && (cause.status === 400 || cause.status === 409)) {
        try {
          onChange(await packagesApi.get(id))
        } catch {
          // The error below says what to do.
        }
      }
      // The notices changed under the creator: said as such, not as a field to fix (principle I).
      if (cause instanceof ApiClientError && cause.body?.fields?.['acknowledgedWarnings']) setCountChanged(true)
      else onError(cause)
    } finally {
      approving.current = false
      setSaving(false)
    }
  }

  const mark = async (key: StudioKey, checked: boolean) => {
    if (marking.current) return
    marking.current = true
    try {
      const base = pkg.studioDone as StudioKey[]
      const done = checked ? [...base, key] : base.filter((one) => one !== key)
      onChange(await packagesApi.studio(id, { done, base }))
    } catch (cause) {
      // Another tab marked something since: the screen shows those marks before saying anything (FR-015).
      if (cause instanceof ApiClientError && cause.status === 409) {
        try {
          onChange(await packagesApi.get(id))
        } catch {
          // The error below says what to do.
        }
      }
      onError(cause)
    } finally {
      marking.current = false
    }
  }

  const download = async (kind: 'md' | 'json' | 'brief') => {
    setDownloadFailed(null)
    try {
      const { blob, name } = await packagesApi.download(id, kind)
      saveFile(blob, name)
    } catch (cause) {
      setDownloadFailed({ cause, kind })
    }
  }

  // Each notice with the source of its own figure (principle V); a calculation of ours already says so in its text.
  const sourceOf = (notice: PackageReviewNotice) => {
    const figure = FIGURE_OF[notice.rule]
    return figure ? (sources[figure] ?? null) : null
  }

  const conceptCopy = () =>
    chosen
      .map(({ index, concept }) =>
        [
          format(text.conceptLine, { n: index + 1, escena: concept.scene }),
          concept.bigText && format(text.bigTextLine, { texto: concept.bigText }),
          concept.emotion && format(text.emotionLine, { texto: concept.emotion }),
          concept.composition && format(text.compositionLine, { texto: concept.composition }),
          concept.colors && format(text.colorsLine, { texto: concept.colors }),
        ]
          .filter(Boolean)
          .join('\n'),
      )
      .join('\n\n')

  const coverCopy = (one: { moment: string; screenText: string }) =>
    [
      format(text.coverMoment, { momento: one.moment }),
      one.screenText && format(text.coverText, { texto: one.screenText }),
    ]
      .filter(Boolean)
      .join('\n')

  const stepName = (step: FixStep) =>
    step === 'portada'
      ? pkg.format === 'short'
        ? publishEs.screen.steps.portadaShort
        : publishEs.screen.steps.portada
      : publishEs.screen.steps.textos

  return (
    <>
      <h2>{publishEs.screen.steps.revisar}</h2>
      <p className={styles.why}>{publishEs.screen.why.revisar}</p>

      <section aria-labelledby="package-notices">
        <h3 id="package-notices">{text.noticesTitle}</h3>
        {failed !== null && (
          <ErrorMessage
            live
            title={errorText(failed)}
            action={{ label: es.app.retry, onClick: () => setAttempt((n) => n + 1) }}
          />
        )}
        {rules === null && failed === null && <p role="status">{text.loading}</p>}
        {rules !== null &&
          (notices.length === 0 ? (
            // The notices of the package itself are above: «todo en orden» would contradict them.
            <p>{pkg.warnings.length > 0 ? text.nothingHere : text.nothing}</p>
          ) : (
            <ul className={styles.options}>
              {notices.map((notice, index) => (
                <Card as="li" key={`${notice.rule}-${notice.kind}-${index}`}>
                  <p>{noticeText(notice, pkg)}</p>
                  {sourceOf(notice) && (
                    <DataSource kind="conocimiento" label={sourceOf(notice)!.label} date={sourceOf(notice)!.date} />
                  )}
                  <div className={styles.actions}>
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={format(text.toStepNamed, { paso: stepName(stepOf(notice.kind)) })}
                      onClick={() => onToStep(stepOf(notice.kind))}
                    >
                      {text.toStep}
                    </Button>
                  </div>
                </Card>
              ))}
            </ul>
          ))}
      </section>

      <section aria-labelledby="package-pieces">
        <h3 id="package-pieces">{text.pieces}</h3>
        <p className={styles.why}>{text.piecesWhy}</p>
        {mainTitle !== null && (
          <Card>
            <h4>{text.title}</h4>
            <p>{mainTitle}</p>
            {copyBlock({ key: 'titulo', name: text.title, value: mainTitle })}
            {alternatives.length > 0 && (
              <>
                <h5>{text.alternatives}</h5>
                <p className={styles.notice}>{text.alternativesWhy}</p>
                <ul className={styles.options}>
                  {alternatives.map((alternative, index) => (
                    <li key={index}>
                      <p>{alternative}</p>
                      {copyBlock({
                        key: `alternativa-${index}`,
                        name: format(text.alternativeName, { n: index + 1 }),
                        value: alternative,
                      })}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        )}
        {pkg.texts.assembled !== null && (
          <Card>
            <h4>{text.description}</h4>
            <p className={styles.assembled}>{pkg.texts.assembled}</p>
            {copyBlock({ key: 'descripcion', name: text.description, value: pkg.texts.assembled })}
            {pkg.format === 'short' && pkg.parentTitle !== null && (
              <p className={styles.notice}>{format(publishEs.texts.related, { titulo: pkg.parentTitle })}</p>
            )}
          </Card>
        )}
        {pkg.format === 'largo' && chosen.length > 0 && (
          <Card>
            <h4>{text.thumbnail}</h4>
            <p className={styles.notice}>{text.thumbnailWhy}</p>
            {/* The same lines that are copied, for whoever makes the image (FR-014). */}
            <p className={styles.assembled}>{conceptCopy()}</p>
            {copyBlock({ key: 'miniatura', name: text.thumbnail, value: conceptCopy() })}
          </Card>
        )}
        {pkg.format === 'short' && cover && cover.moment.trim() !== '' && (
          <Card>
            <h4>{text.cover}</h4>
            <p className={styles.notice}>{text.coverWhy}</p>
            <p className={styles.assembled}>{coverCopy(cover)}</p>
            {copyBlock({ key: 'portada', name: text.cover, value: coverCopy(cover) })}
          </Card>
        )}
        {tags.length > 0 && (
          <Card>
            <h4>{text.tags}</h4>
            <p className={styles.notice}>{text.tagsWhy}</p>
            <p>{tags.join(', ')}</p>
            {copyBlock({ key: 'etiquetas', name: text.tags, value: tags.join(', ') })}
          </Card>
        )}
        <Card>
          <h4>{text.comment}</h4>
          {comment ? (
            <>
              <p className={styles.notice}>{text.commentWhy}</p>
              <p className={styles.assembled}>{comment}</p>
              {copyBlock({ key: 'comentario', name: text.comment, value: comment })}
            </>
          ) : (
            <p className={styles.notice}>{text.commentEmpty}</p>
          )}
        </Card>
      </section>

      <section aria-labelledby="package-studio">
        <h3 id="package-studio">{text.studio}</h3>
        <p className={styles.why}>{text.studioWhy}</p>
        <ul className={styles.options}>
          {pkg.studio.map((item) => {
            const box = (label: string, description: string) => (
              <Checkbox
                label={label}
                description={description}
                checked={pkg.studioDone.includes(item.key)}
                onCheckedChange={(value) => void mark(item.key, value)}
              />
            )
            // Where the text of the setting comes from (principle V); an assumption already says so in its text.
            const cited = (source: { label: string; date: string } | null) =>
              source && <DataSource kind="conocimiento" label={source.label} date={source.date} />
            // The lists go after the box, not inside its description (a paragraph).
            const list = (intro: string, lines: readonly string[]) => (
              <>
                <p className={styles.notice}>{intro}</p>
                <ul>
                  {lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </>
            )
            switch (item.key) {
              case 'publico_infantil':
                return (
                  <li key={item.key}>
                    {box(
                      format(text.studioKids, {
                        respuesta:
                          item.answer === null
                            ? text.studioKidsUnknown
                            : item.answer
                              ? text.studioKidsYes
                              : text.studioKidsNo,
                      }),
                      item.why,
                    )}
                    {cited(item.source)}
                    {item.answer && (
                      <>
                        {list(text.studioKidsMeans, item.implications)}
                        {cited(item.implicationsSource)}
                      </>
                    )}
                  </li>
                )
              case 'contenido_sintetico':
                return (
                  <li key={item.key}>
                    {box(format(text.studioSynthetic, { pregunta: item.question }), item.why)}
                    {list(text.studioSyntheticYes, item.mustDisclose)}
                    {list(text.studioSyntheticNo, item.noNeed)}
                    {cited(item.source)}
                  </li>
                )
              case 'idioma':
                return (
                  <li key={item.key}>
                    {box(
                      format(text.studioLanguage, { respuesta: item.answer }),
                      format(text.studioWhyGuess, { porque: item.why, supuesto: text.studioLanguageGuess }),
                    )}
                  </li>
                )
              case 'categoria':
                return (
                  <li key={item.key}>
                    {box(
                      format(text.studioCategory, { respuesta: item.answer }),
                      item.assumption
                        ? format(text.studioWhyGuess, { porque: item.why, supuesto: text.studioCategoryGuess })
                        : item.why,
                    )}
                  </li>
                )
            }
          })}
        </ul>
      </section>

      <div>
        {approved ? (
          <>
            <p role="status" tabIndex={-1} ref={approvedNote}>
              {pkg.approvals.packageApprovedWarnings
                ? format(
                    pkg.approvals.packageApprovedWarnings === 1
                      ? text.approvedWarnings.one
                      : text.approvedWarnings.other,
                    { n: pkg.approvals.packageApprovedWarnings },
                  )
                : text.approved}
            </p>
            {/* Approved, but the script went back to draft: not ready to upload yet (edge case of the spec). */}
            <p className={scriptApproved ? styles.why : styles.notice}>
              {scriptApproved ? text.nextStep : text.scriptReopened}
            </p>
          </>
        ) : (
          <>
            {countChanged && (
              <p role="status" className={styles.notice}>
                {text.countChanged}
              </p>
            )}
            {!scriptApproved && <p className={styles.notice}>{text.scriptNotApproved}</p>}
            {scriptApproved && hasEmpty && <p className={styles.notice}>{text.hasEmpty}</p>}
            <div className={styles.actions}>
              <Button
                variant="primary"
                loading={saving}
                disabled={!scriptApproved || hasEmpty || rules === null || busy}
                onClick={() => (warnings > 0 ? setAsking(true) : void approve())}
              >
                {text.approve}
              </Button>
            </div>
          </>
        )}
      </div>

      <section aria-labelledby="package-downloads">
        <h3 id="package-downloads">{text.downloads}</h3>
        <p className={styles.why}>{text.downloadsWhy}</p>
        {downloadFailed !== null && (
          <ErrorMessage
            live
            title={text.downloadFailed}
            description={errorText(downloadFailed.cause)}
            action={{ label: es.app.retry, onClick: () => void download(downloadFailed.kind) }}
          />
        )}
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => void download('md')}>
            {text.downloadDocument}
          </Button>
          <Button variant="secondary" onClick={() => void download('json')}>
            {text.downloadData}
          </Button>
          <Button variant="secondary" onClick={() => void download('brief')}>
            {pkg.format === 'short' ? text.downloadCover : text.downloadThumbnail}
          </Button>
        </div>
      </section>

      <Dialog
        open={asking}
        onOpenChange={setAsking}
        title={format(warnings === 1 ? text.warningsTitle.one : text.warningsTitle.other, { n: warnings })}
        description={text.warningsBody}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAsking(false)}>
              {text.warningsReview}
            </Button>
            <Button variant="primary" loading={saving} disabled={saving} onClick={() => void approve()}>
              {text.warningsApprove}
            </Button>
          </>
        }
      />
    </>
  )
}
