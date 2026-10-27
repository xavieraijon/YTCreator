import { describe, expect, it } from 'vitest'
import { toastDuration } from '../src/components/Toast/Toast.tsx'

describe('toastDuration (FR-012a)', () => {
  it('a confirmation goes away on its own: 5 s plus 50 ms per character', () => {
    expect(toastDuration({ title: 'Guion guardado', tone: 'success' })).toBe(5000 + 50 * 14)
    expect(toastDuration({ title: 'Hecho' })).toBe(5250)
  })

  it('a long confirmation stays 12 s at most', () => {
    expect(toastDuration({ title: 'x'.repeat(400), tone: 'info' })).toBe(12_000)
  })

  it('warnings, errors and toasts with an action stay until closed', () => {
    expect(toastDuration({ title: 'Revisa el título', tone: 'warning' })).toBe(Infinity)
    expect(toastDuration({ title: 'No se pudo guardar', tone: 'danger' })).toBe(Infinity)
    expect(toastDuration({ title: 'Idea archivada', action: { label: 'Deshacer', onClick: () => {} } })).toBe(Infinity)
  })

  it('the caller can force a duration or make it persistent', () => {
    expect(toastDuration({ title: 'Error leve', tone: 'danger', duration: 8000 })).toBe(8000)
    expect(toastDuration({ title: 'Clave de la API', tone: 'info', duration: 'persistent' })).toBe(Infinity)
  })
})
