import {
  AiWorking,
  Button,
  Card,
  Disclosure,
  GlassPanel,
  Icon,
  IconButton,
  RadioGroup,
  Select,
  Stepper,
  Switch,
  TextArea,
  TextField,
  useToast,
} from '@ytcreator/ui'
import { ArrowRight, BookOpen, ListChecks, MessageCircleQuestion, RotateCcw, Sparkles, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { sample } from '../strings/sample.es.ts'
import styles from './ChooseApproach.module.css'

const icons = { tutorial: BookOpen, story: UserRound, list: ListChecks } as const

/** Simulated wait of the AI: there is no network call on this page. */
const generationTime = 3000

type Status = 'idle' | 'working' | 'done'

/** Sample step «Elige el enfoque de tu vídeo» (FR-020): every piece of the system together, with mock data. */
export function ChooseApproach() {
  const { toast } = useToast()
  const [status, setStatus] = useState<Status>('idle')
  const [question, setQuestion] = useState(false)
  const timer = useRef<number>(undefined)
  const result = useRef<HTMLDivElement>(null)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  // The wait and the proposal appear below the form: bring them into view so they are not missed on a phone.
  useEffect(() => {
    if (status !== 'idle') result.current?.scrollIntoView({ block: 'center' })
  }, [status])

  const generate = () => {
    setStatus('working')
    timer.current = window.setTimeout(() => {
      setStatus('done')
      toast({ ...sample.toast, tone: 'success' })
    }, generationTime)
  }

  return (
    <div className={styles.page}>
      <Stepper steps={sample.steps} current={3} />

      <header className={styles.intro}>
        <h1 className={styles.title}>{sample.title}</h1>
        <p className={styles.why}>{sample.why}</p>
      </header>

      <RadioGroup
        appearance="cards"
        label={sample.approachLabel}
        name="approach"
        defaultValue="tutorial"
        options={sample.approaches.map((approach) => ({ ...approach, icon: icons[approach.value] }))}
      />

      <TextField
        label={sample.audience.label}
        optional
        placeholder={sample.audience.placeholder}
        description={sample.audience.description}
      />

      <Disclosure summary={sample.expert.summary}>
        <div className={styles.expert}>
          <Select label={sample.expert.lengthLabel} options={sample.expert.lengths} defaultValue="medium" />
          <Switch
            label={sample.expert.hookLabel}
            description={sample.expert.hookDescription}
            checked={question}
            onCheckedChange={setQuestion}
          />
        </div>
      </Disclosure>

      <div ref={result} className={styles.result}>
        {status === 'working' && (
          <GlassPanel>
            <AiWorking variant="panel" label={sample.working} />
          </GlassPanel>
        )}

        {status === 'done' && (
          <Card as="section" aria-labelledby="proposal-heading">
            <h2 id="proposal-heading" className={styles.proposalHeading}>
              {sample.proposal.heading}
            </h2>
            <TextArea label={sample.proposal.titleLabel} defaultValue={sample.proposal.title} rows={2} />
            <TextArea
              label={sample.proposal.hookLabel}
              defaultValue={question ? sample.proposal.hookQuestion : sample.proposal.hookStatement}
              rows={3}
            />
            <div className={styles.again}>
              <Button onClick={generate}>
                <Icon icon={RotateCcw} size="sm" />
                {sample.proposal.again}
              </Button>
              <p className={styles.why}>{sample.proposal.againHint}</p>
            </div>
          </Card>
        )}
      </div>

      <div className={styles.actions}>
        {status === 'done' ? (
          <Button variant="primary" size="lg" onClick={() => toast({ ...sample.nextToast, tone: 'info' })}>
            {sample.next}
            <Icon icon={ArrowRight} size="sm" />
          </Button>
        ) : (
          <Button variant="primary" size="lg" loading={status === 'working'} onClick={generate}>
            <Icon icon={Sparkles} size="sm" />
            {sample.generate}
          </Button>
        )}
      </div>

      <GlassPanel elevation={3} className={styles.assistant}>
        <IconButton label={sample.assistant} icon={MessageCircleQuestion} size="lg" />
      </GlassPanel>
    </div>
  )
}
