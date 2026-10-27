import { catalog } from '../strings/catalog.es.ts'
import { foundations } from '../strings/foundations.es.ts'
import { FoundationPage } from './FoundationPage.tsx'
import styles from './SpacingPage.module.css'
import { TokenTable } from './TokenTable.tsx'
import { select } from './tokens-data.ts'

export function SpacingPage() {
  const strings = foundations.spacing
  return (
    <FoundationPage title={catalog.foundations.espaciado} lead={strings.lead}>
      <TokenTable
        caption={strings.scale}
        tokens={select('space', /^space-/)}
        preview={() => <span className={styles.bar} />}
      />
      <TokenTable
        caption={strings.controls}
        tokens={select('space', /^(control-height|icon-size|target-min)/)}
        preview={() => <span className={styles.square} />}
      />
    </FoundationPage>
  )
}
