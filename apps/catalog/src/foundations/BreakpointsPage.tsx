import { breakpoints } from '@ytcreator/tokens/breakpoints'
import { catalog } from '../strings/catalog.es.ts'
import { foundations } from '../strings/foundations.es.ts'
import styles from './BreakpointsPage.module.css'
import { FoundationPage, Section } from './FoundationPage.tsx'
import tableStyles from './TokenTable.module.css'

export function BreakpointsPage() {
  const strings = foundations.breakpoints
  return (
    <FoundationPage title={catalog.foundations['puntos-de-ruptura']} lead={strings.lead}>
      <div className={tableStyles.scroller}>
        <table className={tableStyles.table}>
          <thead>
            <tr>
              <th scope="col">{strings.name}</th>
              <th scope="col">{strings.value}</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(breakpoints).map(([name, value]) => (
              <tr key={name}>
                <th scope="row" className={tableStyles.name}>
                  <code>{name}</code>
                </th>
                <td>
                  <code>{value}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Section title={strings.notesTitle}>
        <ul className={styles.notes}>
          {strings.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </Section>
    </FoundationPage>
  )
}
