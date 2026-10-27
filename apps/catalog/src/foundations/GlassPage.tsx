import { GlassPanel } from '@ytcreator/ui'
import { catalog } from '../strings/catalog.es.ts'
import { foundations } from '../strings/foundations.es.ts'
import { FoundationPage, Section } from './FoundationPage.tsx'
import styles from './GlassPage.module.css'
import { ThemeSplit } from './ThemeSplit.tsx'
import { TokenTable } from './TokenTable.tsx'
import { tokensOf } from './tokens-data.ts'

export function GlassPage() {
  const strings = foundations.glass
  return (
    <FoundationPage title={catalog.foundations.cristal} lead={strings.lead}>
      <Section title={strings.restraintTitle}>
        <div className={styles.rules}>
          <div>
            <h3 className={styles.ruleTitle}>{strings.allowedTitle}</h3>
            <ul className={styles.list}>
              {strings.allowed.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className={styles.ruleTitle}>{strings.forbiddenTitle}</h3>
            <ul className={styles.list}>
              {strings.forbidden.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className={styles.doubt}>{strings.doubt}</p>
      </Section>

      <div className={styles.demo}>
        <ThemeSplit>
          <div className={styles.stage}>
            <GlassPanel className={styles.panel}>
              <strong className={styles.panelTitle}>{strings.demoTitle}</strong>
              <p>{strings.demoText}</p>
            </GlassPanel>
          </div>
        </ThemeSplit>
      </div>
      <TokenTable caption={catalog.foundations.cristal} tokens={tokensOf('glass')} />
    </FoundationPage>
  )
}
