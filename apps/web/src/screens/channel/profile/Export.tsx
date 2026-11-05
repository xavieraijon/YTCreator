import { Button } from '@ytcreator/ui'
import { channelEs } from '../../../strings/channel.es.ts'
import styles from '../channel.module.css'

const text = channelEs.profile

export const exportUrl = (channelId: string, format: 'md' | 'json') =>
  `/api/channels/${encodeURIComponent(channelId)}/export?format=${format}`

// The server answers with `Content-Disposition: attachment`, so the browser keeps the file and stays on the page.
function download(url: string) {
  const link = document.createElement('a')
  link.href = url
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
}

// FR-026: the document anyone can read first, the open data second. The format only shows in the file's name.
export function ExportButtons({ channelId }: { channelId: string }) {
  return (
    <div className={styles.option}>
      <p className={styles.why}>{text.downloadWhy}</p>
      <div className={styles.actions}>
        <Button variant="primary" onClick={() => download(exportUrl(channelId, 'md'))}>
          {text.downloadDocument}
        </Button>
        <Button onClick={() => download(exportUrl(channelId, 'json'))}>{text.downloadData}</Button>
      </div>
    </div>
  )
}
