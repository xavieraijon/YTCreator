import type { ReactNode } from 'react'
import styles from './FoundationPage.module.css'

export interface FoundationPageProps {
  readonly title: string
  readonly lead: string
  readonly children: ReactNode
}

/** Common frame of the foundation pages: title, lead paragraph and content. */
export function FoundationPage({ title, lead, children }: FoundationPageProps) {
  return (
    <article className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.lead}>{lead}</p>
      </header>
      {children}
    </article>
  )
}

export function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  )
}
