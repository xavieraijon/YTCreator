import { format } from '@ytcreator/ui'
import { subtitlesEs } from '../../../strings/subtitles.es.ts'

const number = (value: number, digits = 0) =>
  new Intl.NumberFormat('es-ES', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value)

/** «580 MB», «1,2 GB»: how much a download takes, rounded. */
export function sizeText(bytes: number): string {
  const units = subtitlesEs.engine
  if (bytes >= 1e9) return format(units.gigabytes, { n: number(bytes / 1e9, 1) })
  return format(units.megabytes, { n: number(Math.max(1, Math.round(bytes / 1e6))) })
}

/** The time of a subtitle as the contract writes it: `m:ss,d` (and `h:mm:ss,d` past an hour). */
export function clockText(seconds: number): string {
  const tenths = Math.round(seconds * 10)
  const h = Math.floor(tenths / 36_000)
  const m = Math.floor((tenths % 36_000) / 600)
  const s = Math.floor((tenths % 600) / 10)
  const d = tenths % 10
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss},${d}` : `${m}:${ss},${d}`
}

/** «Tardará unos N minutos» (R7): never seconds, always «unos». */
export function estimateText(seconds: number): string {
  const text = subtitlesEs.choose
  if (seconds < 45) return text.estimateShort
  const minutes = Math.round(seconds / 60)
  return minutes <= 1 ? text.estimateOne : format(text.estimate, { minutos: minutes })
}
