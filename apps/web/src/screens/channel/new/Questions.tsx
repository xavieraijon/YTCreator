import type { JourneyFullView } from '@ytcreator/core/api'
import { Button, ErrorMessage, TextArea } from '@ytcreator/ui'
import { useState } from 'react'
import { errorText } from '../../../shell/errorText.ts'
import { channelEs } from '../../../strings/channel.es.ts'
import { es } from '../../../strings/es.ts'
import styles from '../channel.module.css'
import { AiAction } from '../Proposal.tsx'
import { latestOf, payloadOf, useEstimate, useGenerate } from '../useJourney.ts'

const text = channelEs.questions

export interface Question {
  readonly id: string
  readonly question: string
  readonly why: string
}
export type Answer = { questionId: string; answer: string }

export interface QuestionsViewProps {
  readonly questions: readonly Question[]
  readonly initial?: readonly Answer[]
  readonly busy?: boolean
  readonly onNext: (answers: Answer[]) => void
  readonly onSkip: () => void
}

export function QuestionsView({ questions, initial = [], busy = false, onNext, onSkip }: QuestionsViewProps) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(initial.map(({ questionId, answer }) => [questionId, answer])),
  )
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault()
        onNext(
          questions.flatMap(({ id }) => {
            const answer = values[id]?.trim()
            return answer ? [{ questionId: id, answer }] : []
          }),
        )
      }}
    >
      {questions.length === 0 && <p className={styles.why}>{text.none}</p>}
      {questions.map(({ id, question, why }) => (
        <TextArea
          key={id}
          label={question}
          description={why}
          optional
          rows={2}
          maxLength={1000}
          value={values[id] ?? ''}
          onChange={(event) => setValues({ ...values, [id]: event.target.value })}
        />
      ))}
      <div className={styles.actions}>
        <Button type="submit" variant="primary" loading={busy}>
          {text.next}
        </Button>
        {questions.length > 0 && (
          <Button disabled={busy} onClick={onSkip}>
            {text.skip}
          </Button>
        )}
      </div>
    </form>
  )
}

export interface QuestionsProps {
  readonly view: JourneyFullView
  readonly busy: boolean
  readonly reload: () => Promise<unknown>
  readonly onStep: (data: object) => void
}

export function Questions({ view, busy, reload, onStep }: QuestionsProps) {
  const proposal = latestOf(view, 'preguntas')
  const { estimate, error: estimateError, refresh } = useEstimate(view.id, 'preguntas', !proposal)
  const generate = useGenerate(view, estimate, reload)
  const failed = estimateError ?? generate.error

  if (proposal) {
    return (
      <QuestionsView
        questions={payloadOf<{ questions: Question[] }>(proposal).questions}
        {...(view.state.answers ? { initial: view.state.answers } : {})}
        busy={busy}
        onNext={(answers) => onStep({ answers })}
        onSkip={() => onStep({ answers: [] })}
      />
    )
  }
  return (
    <div className={styles.form}>
      <p className={styles.why}>{text.why}</p>
      {failed !== null && (
        <ErrorMessage live title={errorText(failed)} action={{ label: es.app.retry, onClick: () => void refresh() }} />
      )}
      <AiAction
        label={text.generate}
        estimate={estimate}
        failure={generate.failure}
        busy={generate.busy}
        onRun={() => void generate.run('preguntas')}
      />
      <div className={styles.actions}>
        <Button disabled={busy || generate.busy} onClick={() => onStep({ answers: [] })}>
          {text.skip}
        </Button>
      </div>
    </div>
  )
}
