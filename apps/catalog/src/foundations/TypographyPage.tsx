import { catalog } from '../strings/catalog.es.ts'
import { foundations } from '../strings/foundations.es.ts'
import { FoundationPage } from './FoundationPage.tsx'
import { TokenTable } from './TokenTable.tsx'
import styles from './TypographyPage.module.css'
import { select, type TokenEntry } from './tokens-data.ts'

const strings = foundations.typography

const groups = [
  ['families', /^font-family-/, 'font-family'],
  ['sizes', /^font-size-/, 'font-size'],
  ['weights', /^font-weight-/, 'font-weight'],
  ['lineHeights', /^line-height-/, 'line-height'],
  ['letterSpacing', /^letter-spacing-/, 'letter-spacing'],
] as const

function sampleText(token: TokenEntry, property: string) {
  if (token.name === 'font-family-mono') return strings.sampleMono
  return property === 'line-height' ? strings.paragraph : strings.sample
}

export function TypographyPage() {
  return (
    <FoundationPage title={catalog.foundations.tipografia} lead={strings.lead}>
      {groups.map(([group, pattern, property]) => (
        <TokenTable
          key={group}
          caption={strings[group]}
          tokens={select('type', pattern)}
          preview={(token) => (
            <span className={styles.sample} data-property={property}>
              {sampleText(token, property)}
            </span>
          )}
        />
      ))}
    </FoundationPage>
  )
}
