import type { SubtitleExportFormat, SubtitlesView } from '@ytcreator/core/api'
import { SUBTITLE_EXPORT_FORMATS } from '@ytcreator/core/api'
import { Button, Disclosure, ErrorMessage, format, RadioGroup } from '@ytcreator/ui'
import { useState } from 'react'
import { subtitlesApi } from '../../../api/client.ts'
import { errorText } from '../../../shell/errorText.ts'
import { subtitlesEs } from '../../../strings/subtitles.es.ts'
import styles from '../channel.module.css'
import { durationText } from '../existing/format.ts'
import { saveFile } from '../scripts/saveFile.ts'
import { clockText } from './format.ts'

const text = subtitlesEs.review

type Cue = NonNullable<SubtitlesView['latest']>['content']['cues'][number]

/** The marks of a subtitle in words: those kept with it and those worked out now (R10). */
function marksOf(cue: Cue, computed: readonly string[]): string[] {
  const words: string[] = []
  for (const flag of cue.flags) {
    if (flag === 'del_guion' || flag === 'cambio_ia') words.push(format(text.marks[flag], { oido: cue.heard ?? '' }))
    else words.push(text.marks[flag])
  }
  for (const mark of computed)
    if (mark === 'lectura_rapida' || mark === 'fuera_de_limites') words.push(text.marks[mark])
  return words
}

// 3. Reviewing (contracts/ui-screens.md), read-only in US1: every subtitle with its time and its marks in words, the
// filter «Para revisar», and «Descargar los subtítulos» (in «Modo experto», the kind of file).
export function ReviewStep({
  view,
}: {
  readonly view: SubtitlesView & { latest: NonNullable<SubtitlesView['latest']> }
}) {
  const cues = view.latest.content.cues
  const pending = cues.filter((cue) => !cue.reviewed && (cue.flags.length > 0 || (view.marks[cue.id]?.length ?? 0) > 0))
  const [filter, setFilter] = useState<'revisar' | 'todos'>(pending.length > 0 ? 'revisar' : 'todos')
  const [kind, setKind] = useState<SubtitleExportFormat>('srt')
  const [error, setError] = useState<unknown>(null)
  const shown = filter === 'revisar' ? pending : cues

  const download = async () => {
    setError(null)
    try {
      const { blob, name } = await subtitlesApi.download(view.scriptId, kind)
      saveFile(blob, name)
    } catch (cause) {
      setError(cause)
    }
  }

  return (
    <section aria-labelledby="review-title">
      <h2 id="review-title">{text.title}</h2>
      {view.audio && (
        <p>
          {format(text.from, {
            nombre: view.audio.sourceName ?? '',
            duracion: durationText(Math.round(view.audio.seconds)),
          })}
        </p>
      )}
      {view.scriptChanged && <p className={styles.notice}>{text.scriptChanged}</p>}
      <div className={styles.actions}>
        <Button variant="primary" onClick={() => void download()} disabled={cues.length === 0}>
          {text.download}
        </Button>
      </div>
      <p className={styles.why}>{text.downloadWhy}</p>
      <Disclosure summary={subtitlesEs.engine.expert}>
        <RadioGroup
          label={text.formatLegend}
          value={kind}
          onValueChange={(value) => setKind(value as SubtitleExportFormat)}
          options={SUBTITLE_EXPORT_FORMATS.map((one) => ({ value: one, label: text.formats[one] }))}
        />
      </Disclosure>
      {error !== null && (
        <ErrorMessage live title={errorText(error)} action={{ label: text.download, onClick: () => void download() }} />
      )}

      {cues.length === 0 ? (
        <p>{text.empty}</p>
      ) : (
        <>
          <RadioGroup
            label={text.filterLegend}
            value={filter}
            onValueChange={(value) => setFilter(value as 'revisar' | 'todos')}
            options={[
              { value: 'revisar', label: format(text.toReview, { n: pending.length }) },
              { value: 'todos', label: format(text.all, { n: cues.length }) },
            ]}
          />
          {shown.length === 0 ? (
            <p>{text.noneToReview}</p>
          ) : (
            <ol aria-label={text.listLabel} className={styles.cueList}>
              {shown.map((cue) => {
                const marks = marksOf(cue, view.marks[cue.id] ?? [])
                return (
                  <li key={cue.id} className={styles.cue}>
                    <p className={styles.cueTime}>
                      {format(text.at, { inicio: clockText(cue.start), fin: clockText(cue.end) })}
                    </p>
                    <p className={styles.cueText}>
                      {cue.text.split('\n').map((line, i) => (
                        <span key={i} className={styles.cueLine}>
                          {line}
                        </span>
                      ))}
                    </p>
                    {marks.length > 0 && (
                      <ul className={styles.cueMarks}>
                        {marks.map((mark) => (
                          <li key={mark}>{mark}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </>
      )}
    </section>
  )
}
