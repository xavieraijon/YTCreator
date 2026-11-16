import type { SubtitlesView } from '@ytcreator/core/api'
import { Button, Dialog, Disclosure } from '@ytcreator/ui'
import { useEffect, useRef, useState } from 'react'
import { subtitlesApi } from '../../../api/client.ts'
import { subtitlesEs } from '../../../strings/subtitles.es.ts'
import styles from '../channel.module.css'

const text = subtitlesEs.review.again

// «Otro montaje» (US5, R16; contracts/ui-screens.md, «Plegado»): choosing the file of a new edit, and deleting the
// audio kept to listen to the subtitles.
export function AnotherEdit({
  view,
  disabled,
  blockedByAi,
  onAgain,
  onReload,
  onError,
}: {
  readonly view: SubtitlesView
  readonly disabled: boolean
  /** The AI's proposal waits: a new recognition would leave it behind unseen. */
  readonly blockedByAi: boolean
  readonly onAgain: () => void
  readonly onReload: () => Promise<void> | void
  readonly onError: (cause: unknown) => void
}) {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const done = useRef<HTMLParagraphElement>(null)
  // The button that opened the question is gone: the focus goes to what happened.
  useEffect(() => {
    if (deleted) done.current?.focus()
  }, [deleted])

  const forget = async () => {
    setAsking(false)
    setBusy(true)
    try {
      await subtitlesApi.forgetAudio(view.scriptId)
      setDeleted(true)
      await onReload()
    } catch (cause) {
      onError(cause)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Disclosure summary={text.title}>
      <p className={styles.why}>{text.why}</p>
      {blockedByAi && <p className={styles.notice}>{text.blockedByAi}</p>}
      <div className={styles.actions}>
        <Button variant="secondary" disabled={disabled || busy || blockedByAi} onClick={onAgain}>
          {text.choose}
        </Button>
      </div>
      {(view.audio?.available || view.newAudio) && (
        <>
          <p className={styles.why}>{text.deleteWhy}</p>
          <div className={styles.actions}>
            <Button variant="ghost" loading={busy} disabled={disabled || busy} onClick={() => setAsking(true)}>
              {text.deleteAudio}
            </Button>
          </div>
        </>
      )}
      {deleted && (
        <p ref={done} role="status" tabIndex={-1}>
          {text.deleted}
        </p>
      )}
      <Dialog
        open={asking}
        onOpenChange={setAsking}
        title={text.deleteTitle}
        description={text.deleteBody}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAsking(false)}>
              {text.deleteKeep}
            </Button>
            <Button variant="danger" onClick={() => void forget()}>
              {text.deleteConfirm}
            </Button>
          </>
        }
      />
    </Disclosure>
  )
}
