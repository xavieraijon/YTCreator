import { catalog } from '../strings/catalog.es.ts'
import { foundations } from '../strings/foundations.es.ts'
import styles from './BordersPage.module.css'
import { FoundationPage } from './FoundationPage.tsx'
import { TokenTable } from './TokenTable.tsx'
import { tokensOf, type TokenEntry } from './tokens-data.ts'

const isFocus = (token: TokenEntry) => token.name.startsWith('focus-ring')

export function BordersPage() {
  return (
    <FoundationPage title={catalog.foundations.bordes} lead={foundations.borders.lead}>
      <TokenTable
        caption={catalog.foundations.bordes}
        tokens={tokensOf('border')}
        preview={(token) =>
          isFocus(token) ? (
            <span className={styles.focus}>{foundations.borders.focusDemo}</span>
          ) : (
            <span className={styles.line} />
          )
        }
      />
    </FoundationPage>
  )
}
