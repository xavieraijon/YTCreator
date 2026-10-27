import { AiWorking } from '@ytcreator/ui'
import { useState } from 'react'
import { catalog } from '../strings/catalog.es.ts'
import { foundations } from '../strings/foundations.es.ts'
import { FoundationPage } from './FoundationPage.tsx'
import styles from './MotionPage.module.css'
import { TokenTable } from './TokenTable.tsx'
import { select } from './tokens-data.ts'

function Track({ kind }: { readonly kind: 'duration' | 'curve' }) {
  return (
    <span className={styles.track}>
      <span className={styles.dot} data-kind={kind} />
    </span>
  )
}

export function MotionPage() {
  const strings = foundations.motion
  const [moved, setMoved] = useState(false)
  return (
    <FoundationPage title={catalog.foundations.movimiento} lead={strings.lead}>
      <div className={styles.demo} data-moved={moved}>
        <button type="button" className={styles.play} aria-pressed={moved} onClick={() => setMoved((on) => !on)}>
          {strings.play}
        </button>
        <AiWorking variant="panel" label={strings.aiDemo} className={styles.ai} />
        <TokenTable
          caption={strings.durations}
          tokens={select('motion', /^duration-/)}
          preview={() => <Track kind="duration" />}
        />
        <TokenTable
          caption={strings.curves}
          tokens={select('motion', /^easing-/)}
          preview={() => <Track kind="curve" />}
        />
      </div>
    </FoundationPage>
  )
}
