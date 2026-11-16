import type { SubtitleExportFormat } from '../api/subtitles.ts'
import type { Cue } from './model.ts'

// The file the creator uploads to YouTube Studio (research.md R14): SRT by default, WebVTT and SBV in «Modo experto».

const pad = (value: number, size = 2) => String(value).padStart(size, '0')

function clock(seconds: number, separator: ',' | '.', hourDigits: 1 | 2): string {
  const total = Math.round(seconds * 1000)
  const ms = total % 1000
  const s = Math.floor(total / 1000) % 60
  const m = Math.floor(total / 60_000) % 60
  const h = Math.floor(total / 3_600_000)
  return `${pad(h, hourDigits)}:${pad(m)}:${pad(s)}${separator}${pad(ms, 3)}`
}

export function exportSubtitles(cues: readonly Cue[], format: SubtitleExportFormat): string {
  const blocks = cues.map((cue, i) => {
    if (format === 'srt') return `${i + 1}\n${clock(cue.start, ',', 2)} --> ${clock(cue.end, ',', 2)}\n${cue.text}\n`
    if (format === 'vtt') return `${clock(cue.start, '.', 2)} --> ${clock(cue.end, '.', 2)}\n${cue.text}\n`
    return `${clock(cue.start, '.', 1)},${clock(cue.end, '.', 1)}\n${cue.text}\n`
  })
  const body = blocks.join('\n')
  return format === 'vtt' ? `WEBVTT\n${body ? `\n${body}` : ''}` : body
}

const slug = (text: string | null) =>
  (text ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** The name of the file: the main title of the package or, without one, the idea's, in plain letters. */
export function subtitlesFileName(mainTitle: string | null, ideaTitle: string, format: SubtitleExportFormat): string {
  const base = slug(mainTitle) || slug(ideaTitle) || 'del-video'
  return `subtitulos-${base}.${format}`
}

/** The file with the subtitles of every script of the channel (R17, FR-020), as `guiones-<canal>.json` in 005. */
export const channelSubtitlesFileName = (displayName: string | null): string =>
  `subtitulos-${slug(displayName) || 'de-mi-canal'}.json`
