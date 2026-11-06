import type { JourneyFullView } from '@ytcreator/core/api'
import { Button, ErrorMessage, format } from '@ytcreator/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { channelApi, profileApi } from '../../../api/client.ts'
import { errorText } from '../../../shell/errorText.ts'
import { channelEs } from '../../../strings/channel.es.ts'
import { es } from '../../../strings/es.ts'
import styles from '../channel.module.css'
import { type Name, Names } from '../new/Names.tsx'
import { latestOf, payloadOf } from '../useJourney.ts'

const text = channelEs.profile.namePanel

export interface NamePanelProps {
  readonly channelId: string
  readonly journeyId: string
  readonly current: { readonly displayName: string | null; readonly handle: string | null }
  readonly onCancel: () => void
  /** The name was changed: the message to show, and the profile is read again. */
  readonly onSaved: (message: string) => void
}

/** The one chosen in the journey's names, with the check of its @ if it has one. */
export function chosenName(view: JourneyFullView): { name: Name; checkId: string | null } | null {
  const proposal = latestOf(view, 'nombres')
  if (!proposal || proposal.status !== 'aprobada' || proposal.selectedIndex === null) return null
  const name = payloadOf<{ names: Name[] }>(proposal).names[proposal.selectedIndex]
  if (!name) return null
  const check = view.nameChecks.findLast((c) => c.displayName === name.displayName && c.handle === name.handle)
  return { name, checkId: check?.id ?? null }
}

// Novice audit 003, M3 (entry 136): the name changes inside «Tu canal», with the proposals, the check of the @ and the
// creator's own; the journey is not opened again and «Cancelar» leaves everything as it was.
export function NamePanel({ channelId, journeyId, current, onCancel, onSaved }: NamePanelProps) {
  const [view, setView] = useState<JourneyFullView | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<unknown>(null)

  // The names there were on opening: «Cancelar» goes back to them if others were proposed meanwhile.
  const openedWith = useRef<string | null | undefined>(undefined)
  const reload = useCallback(async () => {
    const next = await channelApi.journey(journeyId)
    if (openedWith.current === undefined) openedWith.current = latestOf(next, 'nombres')?.id ?? null
    setView(next)
    setError(null)
    return next
  }, [journeyId])

  useEffect(() => {
    reload().catch(setError)
  }, [reload])

  // After a failure, «Reintentar» does again what failed: reading the names or using the chosen one.
  const [failedUse, setFailedUse] = useState(false)

  // Opened with the keyboard, the focus goes to the panel, and Esc closes it (round 2 of the audit).
  const heading = useRef<HTMLHeadingElement>(null)
  const section = useRef<HTMLElement>(null)
  useEffect(() => heading.current?.focus(), [])

  // Esc closes it, unless a question of its own (a red name) is open, which closes first, or the name is being saved.
  const cancelRef = useRef<() => void>(() => undefined)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (document.querySelector('[role="dialog"]')) return
      // Only from the panel (not from another one open on the page), and not while the AI proposes names.
      const panel = section.current
      const focus = document.activeElement
      if (!panel || (focus && focus !== document.body && !panel.contains(focus))) return
      if (panel.querySelector('[aria-busy="true"]')) return
      cancelRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // «Cancelar» leaves the name the channel has chosen again among the proposals, as it was before opening.
  const cancel = async () => {
    try {
      let shown = view ?? (await reload())
      // «Proponer otros» left newer names: back to the ones there were (each «back» recovers the one it replaced).
      for (let step = 0; step < 10 && openedWith.current; step++) {
        const latest = latestOf(shown, 'nombres')
        if (!latest || latest.id === openedWith.current) break
        await channelApi.back(latest.id)
        shown = await reload()
      }
      const proposal = latestOf(shown, 'nombres')
      const names = proposal ? payloadOf<{ names: Name[] }>(proposal).names : []
      const index = names.findIndex((n) => n.displayName === current.displayName && n.handle === current.handle)
      if (proposal && index >= 0 && proposal.selectedIndex !== index) {
        await channelApi.decide(proposal.id, { selectedIndex: index, status: 'aprobada' })
      }
    } catch {
      // Nothing of the channel changed: the panel closes all the same.
    }
    onCancel()
  }
  cancelRef.current = () => {
    if (!saving) void cancel()
  }

  const use = async () => {
    setSaving(true)
    setError(null)
    setFailedUse(false)
    let renamed: string | null = null
    try {
      const chosen = chosenName(await reload())
      if (!chosen) return
      const { name, checkId } = chosen
      // The name the channel has now, read again: after a lost answer, «Reintentar» does not rename it twice.
      const now = (await channelApi.current()).channel ?? current
      if (name.displayName === now.displayName && name.handle === now.handle) {
        const before = name.displayName === current.displayName && name.handle === current.handle
        onSaved(before ? text.unchanged : format(text.savedNoVersion, { nombre: name.displayName }))
        return
      }
      await profileApi.rename(channelId, {
        displayName: name.displayName,
        handle: name.handle,
        ...(checkId ? { checkId } : {}),
      })
      renamed = name.displayName
      const versions = await profileApi.versions(channelId)
      onSaved(format(text.saved, { nombre: name.displayName, version: versions.at(-1)?.version ?? '' }))
    } catch (caught) {
      // Once renamed, the name is saved: only the number of the version could not be read. Not renamed twice.
      if (renamed !== null) onSaved(format(text.savedNoVersion, { nombre: renamed }))
      else {
        setError(caught)
        setFailedUse(true)
      }
    } finally {
      setSaving(false)
    }
  }

  const title = current.displayName === null ? text.titleFirst : text.title
  return (
    <section ref={section} className={styles.option} aria-label={title}>
      <h2 ref={heading} tabIndex={-1}>
        {title}
      </h2>
      <p className={styles.why}>{text.why}</p>
      {error !== null && (
        <ErrorMessage
          live
          title={errorText(error)}
          action={{
            label: es.app.retry,
            onClick: () => void (failedUse ? use() : reload().catch(setError)),
          }}
        />
      )}
      {view === null && (
        <div className={styles.actions}>
          <Button onClick={onCancel}>{text.cancel}</Button>
        </div>
      )}
      {view && (
        <Names
          view={view}
          busy={saving}
          reload={reload}
          onFinish={() => void use()}
          fromProfile={{
            finish: text.finish,
            cancel: text.cancel,
            onCancel: () => void cancel(),
            current,
            currentLabel: text.current,
            chosenLabel: text.chosen,
          }}
        />
      )}
    </section>
  )
}
