import { type ReviewNotice, reviewScript } from '@ytcreator/core'
import type { ScriptReviewView, ScriptView } from '@ytcreator/core/api'
import { Button, Card, DataSource, Dialog, ErrorMessage, format } from '@ytcreator/ui'
import { useEffect, useRef, useState } from 'react'
import { ApiClientError, scriptsApi } from '../../../api/client.ts'
import { errorText } from '../../../shell/errorText.ts'
import { es } from '../../../strings/es.ts'
import { scriptEs } from '../../../strings/script.es.ts'
import styles from '../channel.module.css'
import { clock } from './OutlineStep.tsx'
import { saveFile } from './saveFile.ts'

const text = scriptEs.review

type ReviewRulesView = ScriptReviewView['rules']

export interface ReviewStepProps {
  readonly script: ScriptView
  readonly onChange: (script: ScriptView) => void
  readonly onError: (cause: unknown) => void
  readonly onToBlock: (blockId: string) => void
  readonly onToDraft: () => void
  /** The AI is working on this script: nothing can be approved meanwhile. */
  readonly busy: boolean
}

export function noticeText(notice: ReviewNotice): string {
  switch (notice.rule) {
    case 'duracion':
      return format(text.notices.duracion, { dura: clock(notice.seconds), objetivo: clock(notice.target) })
    case 'gancho_largo':
      return format(text.notices.gancho_largo, { dura: clock(notice.seconds), limite: clock(notice.limit) })
    case 'muletilla':
      return format(text.notices.muletilla, { texto: notice.text })
    case 'frase_larga':
      return format(text.notices.frase_larga, { palabras: notice.words, texto: notice.text })
    case 'por_comprobar':
      return format(notice.count === 1 ? text.notices.por_comprobar.one : text.notices.por_comprobar.other, {
        n: notice.count,
      })
  }
}

// The duration is of the whole script: its block is only where to start.
function whereText(notice: ReviewNotice, titulo: string): string {
  if (notice.rule !== 'duracion') return format(text.inBlock, { titulo })
  return format(notice.seconds > notice.target ? text.startLongest : text.startShortest, { titulo })
}

// What can be fixed for free before recording. Nothing here stops the approval (FR-016).
export function ReviewStep({ script, onChange, onError, onToBlock, onToDraft, busy }: ReviewStepProps) {
  const [rules, setRules] = useState<ReviewRulesView | null>(null)
  const [failed, setFailed] = useState<unknown>(null)
  const [attempt, setAttempt] = useState(0)
  const [asking, setAsking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [changedElsewhere, setChangedElsewhere] = useState(false)
  const [justApproved, setJustApproved] = useState(false)
  const approvedNote = useRef<HTMLParagraphElement>(null)
  const { id } = script

  useEffect(() => {
    const controller = new AbortController()
    scriptsApi
      .review(id, { signal: controller.signal })
      .then((got) => {
        setRules(got.rules)
        setFailed(null)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setFailed(cause)
      })
    return () => controller.abort()
  }, [id, attempt])

  // The button that had the focus has gone: it moves to what took its place.
  useEffect(() => {
    if (justApproved) approvedNote.current?.focus()
  }, [justApproved])

  const draft = script.draft
  if (!draft) return <p className={styles.notice}>{scriptEs.draft.none}</p>

  const { blocks, claims } = draft.content
  const pending = claims.filter((claim) => claim.status === 'pendiente').length
  const approved = script.status === 'guion_aprobado'
  const hasEmpty = blocks.some((block) => block.text.trim() === '')
  const notices = rules
    ? reviewScript({
        format: script.format,
        targetSeconds: script.targetSeconds,
        wordsPerMinute: script.voice.wordsPerMinute,
        blocks,
        claims,
        rules,
      })
    : []
  const titleOf = (blockId: string) => blocks.find((block) => block.id === blockId)?.title || scriptEs.outline.untitled

  const approve = async () => {
    setSaving(true)
    setAsking(false)
    try {
      onChange(await scriptsApi.approveDraft(id, { version: draft.version, acknowledgedPending: pending }))
      setChangedElsewhere(false)
      setJustApproved(true)
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.body?.code === 'conflicto') {
        setChangedElsewhere(true)
        try {
          onChange(await scriptsApi.get(id))
        } catch (reload) {
          onError(reload)
        }
      } else onError(cause)
    } finally {
      setSaving(false)
    }
  }

  const download = async (kind: 'md' | 'json') => {
    try {
      const { blob, name } = await scriptsApi.download(id, kind)
      saveFile(blob, name)
    } catch (cause) {
      onError(cause)
    }
  }

  return (
    <>
      <p className={styles.why}>{text.why}</p>
      {failed !== null && (
        <ErrorMessage
          live
          title={errorText(failed)}
          action={{ label: es.app.retry, onClick: () => setAttempt((n) => n + 1) }}
        />
      )}
      {rules === null && failed === null && <p role="status">{es.app.loading}</p>}
      {rules !== null &&
        (notices.length === 0 ? (
          <p>{text.nothing}</p>
        ) : (
          <ul className={styles.options}>
            {notices.map((notice, index) => (
              <Card as="li" key={`${notice.rule}-${notice.blockId}-${index}`}>
                <p>{noticeText(notice)}</p>
                <p className={styles.notice}>{whereText(notice, titleOf(notice.blockId))}</p>
                <div className={styles.actions}>
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-label={format(text.toBlockNamed, { titulo: titleOf(notice.blockId) })}
                    onClick={() => onToBlock(notice.blockId)}
                  >
                    {text.toBlock}
                  </Button>
                </div>
              </Card>
            ))}
          </ul>
        ))}
      {rules !== null && <DataSource kind="conocimiento" label={rules.basis.label} date={rules.basis.date} />}
      {approved ? (
        <p role="status" tabIndex={-1} ref={approvedNote}>
          {script.draftApprovedPending
            ? format(script.draftApprovedPending === 1 ? text.approvedPending.one : text.approvedPending.other, {
                n: script.draftApprovedPending,
              })
            : text.approved}
        </p>
      ) : (
        <>
          {changedElsewhere && (
            <p role="status" className={styles.notice}>
              {text.changedElsewhere}
            </p>
          )}
          {hasEmpty && <p className={styles.notice}>{text.emptyBlock}</p>}
          <div className={styles.actions}>
            <Button
              variant="primary"
              loading={saving}
              disabled={hasEmpty || busy}
              onClick={() => (pending > 0 ? setAsking(true) : void approve())}
            >
              {text.approve}
            </Button>
          </div>
        </>
      )}
      <div className={styles.actions}>
        <Button variant="secondary" onClick={() => void download('md')}>
          {text.downloadDocument}
        </Button>
        <Button variant="secondary" onClick={() => void download('json')}>
          {text.downloadData}
        </Button>
      </div>
      <Dialog
        open={asking}
        onOpenChange={setAsking}
        title={format(pending === 1 ? text.pendingTitle.one : text.pendingTitle.other, { n: pending })}
        description={text.pendingBody}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setAsking(false)
                onToDraft()
              }}
            >
              {text.pendingReview}
            </Button>
            <Button variant="primary" onClick={() => void approve()}>
              {text.pendingApprove}
            </Button>
          </>
        }
      />
    </>
  )
}
