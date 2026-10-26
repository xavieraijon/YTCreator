import { catalog } from '../strings/catalog.es.ts'
import { foundations } from '../strings/foundations.es.ts'
import styles from './ElevationPage.module.css'
import { FoundationPage } from './FoundationPage.tsx'
import { ThemeSplit } from './ThemeSplit.tsx'
import { TokenTable } from './TokenTable.tsx'
import { tokensOf } from './tokens-data.ts'

export function ElevationPage() {
  return (
    <FoundationPage title={catalog.foundations.elevacion} lead={foundations.elevation.lead}>
      <TokenTable
        caption={catalog.foundations.elevacion}
        tokens={tokensOf('shadow')}
        preview={() => (
          <ThemeSplit size="compact">
            <span className={styles.card} />
          </ThemeSplit>
        )}
      />
    </FoundationPage>
  )
}
