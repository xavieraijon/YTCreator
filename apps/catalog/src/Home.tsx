import { FoundationPage, Section } from './foundations/FoundationPage.tsx'
import styles from './Home.module.css'
import { foundationCategories, href } from './router.ts'
import { catalog } from './strings/catalog.es.ts'
import { foundations } from './strings/foundations.es.ts'

export function Home() {
  const strings = foundations.home
  return (
    <FoundationPage title={catalog.title} lead={strings.lead}>
      <Section title={strings.levelsTitle}>
        <ul role="list" className={styles.levels}>
          {strings.levels.map((level) => (
            <li key={level.prefix} className={styles.level}>
              <p className={styles.levelName}>
                {level.name} <code>{level.prefix}</code>
              </p>
              <p className={styles.text}>{level.text}</p>
              <dl className={styles.facts}>
                <dt>{strings.exampleLabel}</dt>
                <dd>
                  <code>{level.example}</code>
                </dd>
                <dt>{strings.whoLabel}</dt>
                <dd>{level.who}</dd>
              </dl>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={strings.missingTitle}>
        <ol className={styles.missing}>
          {strings.missing.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </Section>

      <Section title={strings.restraintTitle}>
        <ul className={styles.restraint}>
          {strings.restraint.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </Section>

      <Section title={strings.foundationsTitle}>
        <ul role="list" className={styles.links}>
          {foundationCategories.map((category) => (
            <li key={category}>
              <a className={styles.link} href={href({ page: 'foundation', category })}>
                {catalog.foundations[category]}
              </a>
            </li>
          ))}
        </ul>
      </Section>
    </FoundationPage>
  )
}
