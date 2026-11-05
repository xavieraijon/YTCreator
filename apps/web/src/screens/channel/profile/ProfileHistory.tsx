import type { ProfileVersionItem } from '@ytcreator/core/api'
import { Button, format } from '@ytcreator/ui'
import { channelEs } from '../../../strings/channel.es.ts'
import styles from '../channel.module.css'

const text = channelEs.profile
const when = (iso: string) =>
  new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

export interface ProfileHistoryProps {
  readonly versions: readonly ProfileVersionItem[]
  readonly current: number
  // The version being brought back, or being shown.
  readonly busy: number | null
  readonly shown?: number | null
  readonly onRestore: (version: number) => void
  readonly onShow: (version: number | null) => void
}

// FR-024: every version, newest first; any but the current one can be brought back, which saves it as a new one.
export function ProfileHistory({ versions, current, busy, shown = null, onRestore, onShow }: ProfileHistoryProps) {
  const newestFirst = [...versions].sort((a, b) => b.version - a.version)
  return (
    <ol className={styles.figures}>
      {newestFirst.map((item) => (
        <li key={item.version} className={styles['indicator-row']}>
          <strong>{format(text.version, { numero: String(item.version) })}</strong>
          <span>
            {text.origin[item.origin]} · {when(item.createdAt)}
          </span>
          {item.version === current ? (
            <span>{text.currentVersion}</span>
          ) : (
            <div className={styles.actions}>
              <Button size="sm" onClick={() => onShow(shown === item.version ? null : item.version)}>
                {shown === item.version ? text.hide : text.show}
              </Button>
              <Button
                size="sm"
                loading={busy === item.version}
                disabled={busy !== null && busy !== item.version}
                onClick={() => onRestore(item.version)}
              >
                {text.restore}
              </Button>
            </div>
          )}
        </li>
      ))}
    </ol>
  )
}
