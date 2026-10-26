import { catalog } from '../strings/catalog.es.ts'
import { foundations } from '../strings/foundations.es.ts'
import { FoundationPage } from './FoundationPage.tsx'
import styles from './RadiusPage.module.css'
import { TokenTable } from './TokenTable.tsx'
import { tokensOf } from './tokens-data.ts'

export function RadiusPage() {
  return (
    <FoundationPage title={catalog.foundations.radios} lead={foundations.radius.lead}>
      <TokenTable
        caption={catalog.foundations.radios}
        tokens={tokensOf('radius')}
        preview={() => <span className={styles.shape} />}
      />
    </FoundationPage>
  )
}
