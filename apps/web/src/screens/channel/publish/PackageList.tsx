import type { PackageSummary, ScriptSummary } from '@ytcreator/core/api'
import { Badge, Button, Card, EmptyState, ErrorMessage, format } from '@ytcreator/ui'
import { Send } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { channelApi, packagesApi, scriptsApi } from '../../../api/client.ts'
import { navigate } from '../../../router.ts'
import { errorText } from '../../../shell/errorText.ts'
import { Screen } from '../../../shell/Screen.tsx'
import { es } from '../../../strings/es.ts'
import { publishEs } from '../../../strings/publish.es.ts'
import { scriptEs } from '../../../strings/script.es.ts'
import styles from '../channel.module.css'
import { saveFile } from '../scripts/saveFile.ts'

const text = publishEs.list
const statusText = ({ format, status }: PackageSummary) =>
  (format === 'short' && status in publishEs.statusShort
    ? publishEs.statusShort[status as keyof typeof publishEs.statusShort]
    : undefined) ?? publishEs.status[status]
const dateOf = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })

// «Mis publicaciones»: what goes to YouTube with each video, the last one touched first (contracts/ui-screens.md).
export function PackageList() {
  const [packages, setPackages] = useState<readonly PackageSummary[] | null>(null)
  // Approved scripts with no package yet: the publication starts here too (novice audit 006, M1).
  const [ready, setReady] = useState<readonly ScriptSummary[]>([])
  const [opening, setOpening] = useState<string | null>(null)
  const [openFailed, setOpenFailed] = useState<{ cause: unknown; scriptId: string } | null>(null)

  const prepare = async (scriptId: string) => {
    setOpenFailed(null)
    setOpening(scriptId)
    try {
      const pkg = await packagesApi.open(scriptId)
      navigate({ page: 'package', id: pkg.id })
    } catch (cause) {
      setOpenFailed({ cause, scriptId })
    } finally {
      setOpening(null)
    }
  }
  const [error, setError] = useState<unknown>(null)
  const [downloadFailed, setDownloadFailed] = useState<{ cause: unknown; kind: 'md' | 'json' } | null>(null)

  // Every package with something in it, at once (FR-023).
  const downloadAll = async (kind: 'md' | 'json') => {
    setDownloadFailed(null)
    try {
      const current = await channelApi.current()
      if (!current.channel) return
      const { blob, name } = await packagesApi.downloadAll(current.channel.id, kind)
      saveFile(blob, name)
    } catch (cause) {
      setDownloadFailed({ cause, kind })
    }
  }

  const load = useCallback(async (signal?: AbortSignal) => {
    setError(null)
    try {
      const current = await channelApi.current({ signal })
      if (!current.channel || !current.profile) {
        navigate({ page: 'channelStart' })
        return
      }
      // The scripts only add the ready ones: if they fail, the packages are still shown.
      const [listed, scripts] = await Promise.all([
        packagesApi.list(current.channel.id, { signal }),
        scriptsApi.list(current.channel.id, { signal }).catch(() => []),
      ])
      setPackages(listed)
      setReady(
        scripts.filter(
          (script) => script.status === 'guion_aprobado' && !listed.some((pkg) => pkg.scriptId === script.id),
        ),
      )
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
      ) : packages.length === 0 && ready.length === 0 ? (
        <EmptyState
          icon={Send}
          titleAs="h2"
          title={text.emptyTitle}
          description={text.emptyBody}
          action={{ label: text.toScripts, onClick: () => navigate({ page: 'scriptList' }) }}
        />
      ) : (
        <>
          {ready.length > 0 && (
            <section aria-labelledby="ready-scripts">
              <h2 id="ready-scripts">{text.readyTitle}</h2>
              <p className={styles.why}>{text.readyWhy}</p>
              <ul className={styles.options}>
                {ready.map((script, index) => (
                  <Card as="li" key={script.id} className={styles.option}>
                    <h3>{script.title}</h3>
                    <p>
                      <Badge>{scriptEs.format[script.format]}</Badge>
                    </p>
                    <div className={styles.actions}>
                      <Button
                        variant={index === 0 ? 'primary' : 'secondary'}
                        aria-label={format(text.prepareNamed, { titulo: script.title })}
                        loading={opening === script.id}
                        disabled={opening !== null}
                        onClick={() => void prepare(script.id)}
                      >
                        {publishEs.entry.prepare}
                      </Button>
                    </div>
                  </Card>
                ))}
              </ul>
              {openFailed !== null && (
                <ErrorMessage
                  live
                  title={errorText(openFailed.cause)}
                  action={{ label: es.app.retry, onClick: () => void prepare(openFailed.scriptId) }}
                />
              )}
            </section>
          )}
          {packages.length > 0 && ready.length > 0 && <h2>{text.madeTitle}</h2>}
          {packages.length > 0 && (
            <ul className={styles.options}>
              {packages.map((pkg, index) => (
                <Card as="li" key={pkg.id} className={styles.option}>
                  {/* Under «Publicaciones empezadas» when the ready scripts go first, as their cards are under theirs. */}
                  {ready.length > 0 ? <h3>{pkg.title}</h3> : <h2>{pkg.title}</h2>}
                  <p>
                    <Badge>{scriptEs.format[pkg.format]}</Badge> <Badge>{statusText(pkg)}</Badge>
                  </p>
                  <p>{format(text.updated, { date: dateOf(pkg.updatedAt) })}</p>
                  <div className={styles.actions}>
                    <Button
                      variant={index === 0 && ready.length === 0 ? 'primary' : 'secondary'}
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
        </>
      )}
      {downloadFailed !== null && (
        <ErrorMessage
          live
          title={errorText(downloadFailed.cause)}
          action={{ label: es.app.retry, onClick: () => void downloadAll(downloadFailed.kind) }}
        />
      )}
      <div className={styles.actions}>
        {packages !== null && packages.some((pkg) => pkg.status !== 'sin_empezar') && (
          <>
            <Button variant="secondary" onClick={() => void downloadAll('md')}>
              {text.downloadAllDocument}
            </Button>
            <Button variant="secondary" onClick={() => void downloadAll('json')}>
              {text.downloadAllData}
            </Button>
          </>
        )}
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
