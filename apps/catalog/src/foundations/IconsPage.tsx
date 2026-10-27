import { Icon, type IconSize } from '@ytcreator/ui'
import {
  Bell,
  Captions,
  Check,
  ChevronRight,
  CircleAlert,
  Clapperboard,
  FileText,
  Info,
  Lightbulb,
  Mic,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  Video,
} from 'lucide-react'
import { catalog } from '../strings/catalog.es.ts'
import { foundations } from '../strings/foundations.es.ts'
import { FoundationPage, Section } from './FoundationPage.tsx'
import styles from './IconsPage.module.css'

const gallery = {
  Sparkles,
  Lightbulb,
  Clapperboard,
  Video,
  Mic,
  Captions,
  FileText,
  Upload,
  Search,
  Settings,
  Bell,
  Info,
  CircleAlert,
  Check,
  Trash2,
  ChevronRight,
}

const sizes: readonly IconSize[] = ['sm', 'md', 'lg']

export function IconsPage() {
  const strings = foundations.icons
  return (
    <FoundationPage title={catalog.foundations.iconos} lead={strings.lead}>
      <Section title={strings.sizes}>
        <ul role="list" className={styles.sizes}>
          {sizes.map((size) => (
            <li key={size} className={styles.size}>
              <Icon icon={Sparkles} size={size} />
              <code>{size}</code>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={strings.decorativeTitle}>
        <div className={styles.notes}>
          <p>{strings.decorative}</p>
          <p>{strings.labelled}</p>
        </div>
      </Section>

      <Section title={strings.gallery}>
        <ul role="list" className={styles.gallery}>
          {Object.entries(gallery).map(([name, glyph]) => (
            <li key={name} className={styles.item}>
              <Icon icon={glyph} size="lg" />
              <code>{name}</code>
            </li>
          ))}
        </ul>
      </Section>
    </FoundationPage>
  )
}
