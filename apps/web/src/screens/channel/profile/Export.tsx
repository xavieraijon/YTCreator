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
// Novice audit 003, M7: the browser keeps it without a word, so the screen says where it went and what opens it.
export function ExportButtons({
  channelId,
  onDownloaded,
}: {
  channelId: string
  onDownloaded?: ((message: string) => void) | undefined
}) {
  const save = (format: 'md' | 'json') => {
    download(exportUrl(channelId, format))
    onDownloaded?.(format === 'md' ? text.downloadedDocument : text.downloadedData)
  }
  return (
    <div className={styles.option}>
      <p className={styles.why}>{text.downloadWhy}</p>
      <div className={styles.actions}>
        <Button variant="primary" onClick={() => save('md')}>
          {text.downloadDocument}
        </Button>
        <Button onClick={() => save('json')}>{text.downloadData}</Button>
      </div>
    </div>
  )
}
