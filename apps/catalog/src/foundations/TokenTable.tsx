import type { CSSProperties, ReactNode } from 'react'
import { foundations } from '../strings/foundations.es.ts'
import styles from './TokenTable.module.css'
import { cssVar, themed, type TokenEntry } from './tokens-data.ts'

export interface TokenTableProps {
  readonly caption: string
  readonly tokens: readonly TokenEntry[]
  /** Renders the sample of a row. The token value is available inside as `var(--preview)`. */
  readonly preview?: (token: TokenEntry) => ReactNode
}

/** Name, usage, source primitive and value of each token (contracts/catalog.md). */
export function TokenTable({ caption, tokens, preview }: TokenTableProps) {
  const strings = foundations.table
  return (
    <div className={styles.scroller}>
      <table className={styles.table}>
        <caption className={styles.caption}>{caption}</caption>
        <thead>
          <tr>
            {preview && <th scope="col">{strings.sample}</th>}
            <th scope="col">{strings.token}</th>
            <th scope="col">{strings.usage}</th>
            <th scope="col">{strings.primitive}</th>
            <th scope="col">{strings.value}</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((token) => (
            <tr key={token.name} style={{ '--preview': cssVar(token) } as CSSProperties}>
              {preview && <td className={styles.preview}>{preview(token)}</td>}
              <th scope="row" className={styles.name}>
                <code>{token.cssProperty}</code>
              </th>
              <td className={styles.usage}>{token.description}</td>
              <td>{token.ref && <code>{themed(token.ref)}</code>}</td>
              <td>
                <code className={styles.value}>{themed(token.value)}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
