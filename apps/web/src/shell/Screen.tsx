import { format } from '@ytcreator/ui'
import { useEffect, type ReactNode } from 'react'
import { es } from '../strings/es.ts'
import styles from './Screen.module.css'

export interface ScreenProps {
  readonly title: string
  /** Above the title, such as the wizard's progress. */
  readonly before?: ReactNode
  readonly children?: ReactNode
}

// Every screen has one h1, which also names the browser tab. App moves the focus to it on each route change.
export function Screen({ title, before, children }: ScreenProps) {
  useEffect(() => {
    document.title = format(es.app.documentTitle, { pantalla: title })
  }, [title])

  return (
    <div className={styles.screen}>
      {before}
      <h1 className={styles.title} tabIndex={-1}>
        {title}
      </h1>
      {children}
    </div>
  )
}
