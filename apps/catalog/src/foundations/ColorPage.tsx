import type { CSSProperties } from 'react'
import { catalog } from '../strings/catalog.es.ts'
import { foundations } from '../strings/foundations.es.ts'
import styles from './ColorPage.module.css'
import { FoundationPage, Section } from './FoundationPage.tsx'
import { ThemeSplit } from './ThemeSplit.tsx'
import tableStyles from './TokenTable.module.css'
import { TokenTable } from './TokenTable.tsx'
import { contrastPairs, select, semanticVar, type TokenEntry } from './tokens-data.ts'

const groups = [
  ['surfaces', /^color-(bg|surface)/],
  ['text', /^color-text-/],
  ['border', /^color-border-/],
  ['accent', /^(color-accent|gradient-)/],
  ['status', /^color-(success|warning|danger|info)-/],
] as const

const kindOf = (token: TokenEntry) =>
  /^color-(text-.+|.+-fg)$/.test(token.name) ? 'text' : /^color-(border|.+-border)/.test(token.name) ? 'border' : 'fill'

function Swatch({ token }: { readonly token: TokenEntry }) {
  const kind = kindOf(token)
  const on = token.allowedOn?.[0]
  return (
    <ThemeSplit size="compact">
      <span
        className={styles.swatch}
        data-kind={kind}
        style={on ? ({ '--on': semanticVar(on) } as CSSProperties) : undefined}
      >
        {kind === 'text' && 'Aa'}
      </span>
    </ThemeSplit>
  )
}

const ratio = (value: number) => value.toFixed(2).replace('.', ',')

export function ColorPage() {
  const strings = foundations.color
  return (
    <FoundationPage title={catalog.foundations.color} lead={strings.lead}>
      {groups.map(([group, pattern]) => (
        <TokenTable
          key={group}
          caption={strings.groups[group]}
          tokens={select('color', pattern)}
          preview={(token) => <Swatch token={token} />}
        />
      ))}

      <Section title={strings.contrastTitle}>
        <p className={styles.lead}>{strings.contrastLead}</p>
        <div className={tableStyles.scroller}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th scope="col">{strings.contrast.sample}</th>
                <th scope="col">{strings.contrast.foreground}</th>
                <th scope="col">{strings.contrast.background}</th>
                <th scope="col">{strings.contrast.kind}</th>
                <th scope="col">{strings.contrast.light}</th>
                <th scope="col">{strings.contrast.dark}</th>
                <th scope="col">{strings.contrast.allowed}</th>
              </tr>
            </thead>
            <tbody>
              {contrastPairs.map((pair) => (
                <tr key={`${pair.foreground}|${pair.background}`}>
                  <td>
                    <ThemeSplit size="compact">
                      <span
                        className={styles.pair}
                        style={
                          {
                            '--fg': semanticVar(pair.foreground),
                            '--bg': semanticVar(pair.background),
                          } as CSSProperties
                        }
                      >
                        Aa
                      </span>
                    </ThemeSplit>
                  </td>
                  <td>
                    <code>{pair.foreground}</code>
                  </td>
                  <td>
                    <code>{pair.background}</code>
                  </td>
                  <td>{strings.contrast.kinds[pair.kind]}</td>
                  <td className={styles.number}>{ratio(pair.ratio.light)}</td>
                  <td className={styles.number}>{ratio(pair.ratio.dark)}</td>
                  <td className={styles.allowed} data-allowed={pair.allowed}>
                    {pair.allowed ? strings.contrast.yes : strings.contrast.no}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </FoundationPage>
  )
}
