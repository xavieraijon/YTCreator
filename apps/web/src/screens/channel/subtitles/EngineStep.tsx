import type { SpeechEngineView } from '@ytcreator/core/api'
import { Button, Card, Disclosure, ErrorMessage, format, ProgressBar, RadioGroup } from '@ytcreator/ui'
import { useEffect, useState } from 'react'
import { speechEngineApi, watchJob } from '../../../api/client.ts'
import { errorText } from '../../../shell/errorText.ts'
import { subtitlesEs } from '../../../strings/subtitles.es.ts'
import styles from '../channel.module.css'
import { sizeText } from './format.ts'

const text = subtitlesEs.engine

// Never the technical name of a model (principle I): one without its text is «otro».
const modelName = (id: string) => text.models[id] ?? text.modelOther

// The program that listens, downloaded once before the first subtitles (R1, R2; contracts/ui-screens.md, «Elegir»).
// In «Modo experto», the model and its size.
export function EngineStep({
  engine,
  onChanged,
}: {
  readonly engine: SpeechEngineView
  readonly onChanged: () => Promise<void>
}) {
  const running = engine.job?.status === 'en_curso' ? engine.job : null
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(running ? running.progress : null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [picked, setPicked] = useState(engine.model)
  const failed = engine.job?.status === 'fallido' || engine.job?.status === 'interrumpido' ? engine.job : null

  // A download already under way (or started now): its progress, until it ends.
  const jobId = running?.id ?? null
  useEffect(() => {
    if (!jobId) return
    return watchJob(jobId, (event) => {
      if (event.type === 'progress') setProgress({ done: event.done, total: event.total })
      if (event.type === 'done' || event.type === 'failed') void onChanged()
    })
  }, [jobId, onChanged])

  const start = async (model?: string) => {
    setError(null)
    setBusy(true)
    try {
      await speechEngineApi.start(model)
      await onChanged()
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }

  const choose = async (model: string) => {
    setError(null)
    try {
      await speechEngineApi.choose(model)
      await onChanged()
    } catch (cause) {
      setError(cause)
    }
  }

  const expert = (
    <Disclosure summary={text.expert}>
      <RadioGroup
        label={text.modelLegend}
        description={text.modelWhy}
        value={picked}
        onValueChange={setPicked}
        options={engine.models.map((model) => ({
          value: model.id,
          label: format(text.modelOption, {
            nombre: model.recommended ? format(text.recommended, { nombre: modelName(model.id) }) : modelName(model.id),
            tamano: sizeText(model.sizeBytes),
          }),
        }))}
      />
      {picked !== engine.model &&
        (engine.models.find((model) => model.id === picked)?.installed ? (
          <Button variant="secondary" onClick={() => void choose(picked)}>
            {text.useModel}
          </Button>
        ) : (
          <>
            <p>{text.modelMissing}</p>
            <Button variant="secondary" loading={busy} disabled={running !== null} onClick={() => void start(picked)}>
              {text.downloadModel}
            </Button>
          </>
        ))}
      {engine.installed && <p>{format(text.modelInUse, { nombre: modelName(engine.model) })}</p>}
    </Disclosure>
  )

  // A download the server did not finish has no failure of its own: it stopped before the end.
  const failureText = failed
    ? (text.failures[failed.failure ?? (failed.status === 'interrumpido' ? 'interrumpido' : 'interno')] ??
      text.failures['interno'])
    : ''
  // Retrying takes the model being downloaded in «Modo experto», or the program itself.
  const retry = () => void start(engine.installed && picked !== engine.model ? picked : undefined)
  const problems = (
    <>
      {failed && (
        <ErrorMessage
          live
          title={text.failureTitle}
          description={failureText}
          action={{ label: text.retry, onClick: retry }}
        />
      )}
      {error !== null && <ErrorMessage live title={errorText(error)} action={{ label: text.retry, onClick: retry }} />}
    </>
  )

  // With the program there, only «Modo experto» stays, and what failed in it is still said (principle I).
  if (engine.installed && !running)
    return (
      <>
        {expert}
        {problems}
      </>
    )

  return (
    <Card as="section" aria-labelledby="engine-title">
      <h2 id="engine-title">{text.title}</h2>
      {running ? (
        <ProgressBar
          label={text.downloading}
          {...(progress && progress.total > 0 ? { value: (progress.done / progress.total) * 100 } : {})}
        />
      ) : (
        <>
          <p>{format(text.needed, { tamano: sizeText(engine.missingBytes) })}</p>
          <p className={styles.why}>{text.why}</p>
          {failed && (
            <ErrorMessage
              live
              title={text.failureTitle}
              description={failureText}
              action={{ label: text.retry, onClick: retry }}
            />
          )}
          {!failed && (
            <div className={styles.actions}>
              <Button variant="primary" loading={busy} onClick={() => void start()}>
                {text.download}
              </Button>
            </div>
          )}
        </>
      )}
      {error !== null && <ErrorMessage live title={errorText(error)} action={{ label: text.retry, onClick: retry }} />}
      {expert}
    </Card>
  )
}
