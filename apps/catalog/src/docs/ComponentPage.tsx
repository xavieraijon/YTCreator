import type { Category } from '@ytcreator/tokens'
import { Check, X } from 'lucide-react'
import { Icon } from '@ytcreator/ui'
import { FoundationPage, Section } from '../foundations/FoundationPage.tsx'
import { ThemeSplit } from '../foundations/ThemeSplit.tsx'
import { tokens } from '../foundations/tokens-data.ts'
import { href, type FoundationCategory } from '../router.ts'
import { catalog } from '../strings/catalog.es.ts'
import styles from './ComponentPage.module.css'
import type { ComponentDoc } from './types.ts'

const foundationOf: Partial<Record<Category, FoundationCategory>> = {
  color: 'color',
  type: 'tipografia',
  space: 'espaciado',
  radius: 'radios',
  shadow: 'elevacion',
  glass: 'cristal',
  border: 'bordes',
  layer: 'capas',
  motion: 'movimiento',
}

const byName = new Map(tokens.map((token) => [token.name, token]))

function TokenLink({ name }: { readonly name: string }) {
  const token = byName.get(name)
  const category = token && foundationOf[token.category]
  const label = <code>{token?.cssProperty ?? name}</code>
  return category ? <a href={href({ page: 'foundation', category })}>{label}</a> : label
}

function Examples({ kind, items }: { readonly kind: 'dos' | 'donts'; readonly items: ComponentDoc['dos'] }) {
  return (
    <ul role="list" className={styles.examples}>
      {items.map((item) => (
        <li key={item.text} className={styles.example} data-kind={kind}>
          <p className={styles.exampleText}>
            <Icon icon={kind === 'dos' ? Check : X} size="sm" />
            {item.text}
          </p>
          {item.render && <div className={styles.stage}>{item.render()}</div>}
        </li>
      ))}
    </ul>
  )
}

/** Page generated from a `ComponentDoc` (contracts/catalog.md). */
export function ComponentPage({ doc }: { readonly doc: ComponentDoc }) {
  const strings = catalog.doc
  const [first] = doc.variants
  return (
    <div data-testid={`doc-${doc.id}`}>
      <FoundationPage title={doc.name} lead={doc.summary}>
        <Section title={strings.variants}>
          <div className={styles.grid}>
            {doc.variants.map((variant) => (
              <figure key={variant.title} className={styles.figure}>
                <div className={styles.stage}>{variant.render()}</div>
                <figcaption className={styles.caption}>{variant.title}</figcaption>
              </figure>
            ))}
          </div>
        </Section>

        {doc.states.length > 0 && (
          <Section title={strings.states}>
            <div className={styles.grid}>
              {doc.states.map((state) => (
                <figure key={state.state} className={styles.figure}>
                  <div className={styles.stage}>{state.render()}</div>
                  <figcaption className={styles.caption}>{state.state}</figcaption>
                </figure>
              ))}
            </div>
          </Section>
        )}

        <div className={styles.usage}>
          <Section title={strings.dos}>
            <Examples kind="dos" items={doc.dos} />
          </Section>
          <Section title={strings.donts}>
            <Examples kind="donts" items={doc.donts} />
          </Section>
        </div>

        <Section title={strings.a11y}>
          <ul className={styles.notes}>
            {doc.a11y.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </Section>

        <Section title={strings.tokens}>
          <ul role="list" className={styles.tokens}>
            {doc.tokens.map((name) => (
              <li key={name}>
                <TokenLink name={name} />
              </li>
            ))}
          </ul>
        </Section>

        {first && (
          <Section title={strings.themes}>
            <ThemeSplit>{first.render()}</ThemeSplit>
          </Section>
        )}
      </FoundationPage>
    </div>
  )
}
