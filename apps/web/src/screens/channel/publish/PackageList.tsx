import type { PackageSummary } from '@ytcreator/core/api'
import { Badge, Button, Card, EmptyState, ErrorMessage, format } from '@ytcreator/ui'
import { Send } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { channelApi, packagesApi } from '../../../api/client.ts'
import { navigate } from '../../../router.ts'
import { errorText } from '../../../shell/errorText.ts'
import { Screen } from '../../../shell/Screen.tsx'
import { es } from '../../../strings/es.ts'
import { publishEs } from '../../../strings/publish.es.ts'
import { scriptEs } from '../../../strings/script.es.ts'
import styles from '../channel.module.css'

const text = publishEs.list
const statusText = ({ format, status }: PackageSummary) =>
  (format === 'short' && status in publishEs.statusShort
    ? publishEs.statusShort[status as keyof typeof publishEs.statusShort]
    : undefined) ?? publishEs.status[status]
const dateOf = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })

// «Mis publicaciones»: what goes to YouTube with each video, the last one touched first (contracts/ui-screens.md).
export function PackageList() {
  const [packages, setPackages] = useState<readonly PackageSummary[] | null>(null)
  const [error, setError] = useState<unknown>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    setError(null)
    try {
      const current = await channelApi.current({ signal })
      if (!current.channel || !current.profile) {
        navigate({ page: 'channelStart' })
        return
      }
      setPackages(await packagesApi.list(current.channel.id, { signal }))
    } catch (cause) {
      if (!signal?.aborted) setError(cause)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  return (
    <Screen title={text.title}>
      <p className={styles.why}>{text.why}</p>
      {error !== null ? (
        <ErrorMessage live title={errorText(error)} action={{ label: es.app.retry, onClick: () => void load() }} />
      ) : packages === null ? (
        <p role="status">{es.app.loading}</p>
      ) : packages.length === 0 ? (
        <EmptyState
          icon={Send}
          titleAs="h2"
          title={text.emptyTitle}
          description={text.emptyBody}
          action={{ label: text.toScripts, onClick: () => navigate({ page: 'scriptList' }) }}
        />
      ) : (
        <ul className={styles.options}>
          {packages.map((pkg, index) => (
            <Card as="li" key={pkg.id} className={styles.option}>
              <h2>{pkg.title}</h2>
              <p>
                <Badge>{scriptEs.format[pkg.format]}</Badge> <Badge>{statusText(pkg)}</Badge>
              </p>
              <p>{format(text.updated, { date: dateOf(pkg.updatedAt) })}</p>
              <div className={styles.actions}>
                <Button
                  variant={index === 0 ? 'primary' : 'secondary'}
                  aria-label={format(text.openNamed, { titulo: pkg.title })}
                  onClick={() => navigate({ page: 'package', id: pkg.id })}
                >
                  {text.open}
                </Button>
              </div>
            </Card>
          ))}
        </ul>
      )}
      <div className={styles.actions}>
        <Button variant="secondary" onClick={() => navigate({ page: 'publishSettings' })}>
          {text.settings}
        </Button>
        <Button variant="ghost" onClick={() => navigate({ page: 'channelStart' })}>
          {text.backToChannel}
        </Button>
      </div>
    </Screen>
  )
}
