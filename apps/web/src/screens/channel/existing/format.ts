import { format } from '@ytcreator/ui'
import { channelEs } from '../../../strings/channel.es.ts'

const text = channelEs.existing.reading

export const decimal = (value: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(value)

export function timesText(ratio: number): string {
  const rounded = Math.round(ratio * 10) / 10
  if (rounded < 0.1) return text.timesTiny
  return rounded === 1 ? text.timesOne : format(text.times, { veces: decimal(rounded) })
}

export const videoLine = (title: string, ratio: number) =>
  format(text.video, { titulo: title, veces: timesText(ratio) })

export function durationText(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  return [
    hours > 0 && format(text.durationHours, { n: hours }),
    minutes > 0 && format(text.durationMinutes, { n: minutes }),
    (rest > 0 || seconds === 0) && format(text.durationSeconds, { n: rest }),
  ]
    .filter(Boolean)
    .join(' ')
}

export function paceText(videosPerWeek: number): string {
  if (videosPerWeek < 0.1) return text.paceRare
  return videosPerWeek === 1 ? text.paceOne : format(text.pace, { veces: decimal(videosPerWeek) })
}
