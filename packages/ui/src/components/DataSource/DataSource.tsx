import { BookOpen, ChartColumn, type LucideIcon, Sparkles } from 'lucide-react'
import type { ComponentProps } from 'react'
import { Icon } from '../../icons/index.ts'
import { format } from '../../strings/format.ts'
import { useUiStrings } from '../../strings/UiStringsProvider.tsx'
import { cx } from '../../utils/cx.ts'
import styles from './DataSource.module.css'

type Origin =
  /** A figure read from YouTube, with the day it was read. */
  | { readonly kind: 'youtube'; readonly date: string }
  /** Something from the knowledge package: its name and the day it was reviewed. */
  | { readonly kind: 'conocimiento'; readonly label: string; readonly date: string }
  /** What the AI thinks: it has no source to cite. */
  | { readonly kind: 'ia' }

export type DataSourceProps = Origin & Omit<ComponentProps<'span'>, 'children'>

const ICONS: Record<Origin['kind'], LucideIcon> = { youtube: ChartColumn, conocimiento: BookOpen, ia: Sparkles }

// A plain date is a day, in any time zone; a moment is shown in the reader's own.
function formatDay(date: string): string {
  const options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) options.timeZone = 'UTC'
  return new Intl.DateTimeFormat('es-ES', options).format(new Date(date))
}

/** Says where a piece of information comes from, so data and opinion never read the same. */
export function DataSource(props: DataSourceProps) {
  const strings = useUiStrings().dataSource
  const { kind, className, ...rest } = props
  // What is left of `rest` goes to the span; the date and label are only read for the text.
  const spanProps: ComponentProps<'span'> & { date?: string; label?: string } = { ...rest }
  delete spanProps.date
  delete spanProps.label
  const text =
    props.kind === 'youtube'
      ? format(strings.youtube, { fecha: formatDay(props.date) })
      : props.kind === 'conocimiento'
        ? format(strings.conocimiento, { fuente: props.label, fecha: formatDay(props.date) })
        : strings.ia
  return (
    <span {...spanProps} data-kind={kind} className={cx(styles.dataSource, className)}>
      <Icon icon={ICONS[kind]} size="sm" />
      <span>{text}</span>
    </span>
  )
}
