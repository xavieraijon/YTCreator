// Euros as the creator writes them ("0,50", "3", "20.5 €") ↔ whole cents, with no floating point on the way.
const EUROS = /^(\d{1,7})(?:[.,](\d{1,2}))?$/

export function parseEuros(text: string): number | null {
  const match = EUROS.exec(text.replace(/\s|€/g, ''))
  if (!match) return null
  const [, whole = '0', fraction = ''] = match
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

export function formatEuros(cents: number): string {
  const whole = Math.trunc(cents / 100)
  const fraction = String(Math.abs(cents % 100)).padStart(2, '0')
  return `${whole},${fraction}`
}
