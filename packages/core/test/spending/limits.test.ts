import { describe, expect, it } from 'vitest'
import { MAX_MONTHLY_CENTS, PROPOSED_LIMITS, validateLimits } from '../../src/spending/limits.ts'

const valid = { perOperationCents: 50, dailyCents: 300, monthlyCents: 2000 }

describe('PROPOSED_LIMITS', () => {
  it('proposes 0,50 €, 3,00 € and 20,00 € (R17)', () => {
    expect(PROPOSED_LIMITS).toEqual({ perOperationCents: 50, dailyCents: 300, monthlyCents: 2000 })
  })

  it('passes its own validation', () => {
    expect(validateLimits(PROPOSED_LIMITS)).toEqual({ ok: true, limits: PROPOSED_LIMITS })
  })
})

describe('validateLimits', () => {
  it('accepts the three limits equal, and the monthly limit at 1000 €', () => {
    expect(validateLimits({ perOperationCents: 100, dailyCents: 100, monthlyCents: 100 }).ok).toBe(true)
    expect(validateLimits({ ...valid, monthlyCents: MAX_MONTHLY_CENTS }).ok).toBe(true)
  })

  it.each([0, -1])('debe_ser_positivo when the per-operation limit is %i', (perOperationCents) => {
    expect(validateLimits({ ...valid, perOperationCents })).toEqual({
      ok: false,
      fields: { perOperationCents: 'debe_ser_positivo' },
    })
  })

  it('mayor_que_diario when the per-operation limit is above the daily one', () => {
    expect(validateLimits({ ...valid, perOperationCents: 301 })).toEqual({
      ok: false,
      fields: { perOperationCents: 'mayor_que_diario' },
    })
  })

  it('mayor_que_mensual when the daily limit is above the monthly one', () => {
    expect(validateLimits({ ...valid, dailyCents: 2001 })).toEqual({
      ok: false,
      fields: { dailyCents: 'mayor_que_mensual' },
    })
  })

  it('demasiado_alto when the monthly limit is above 1000 €', () => {
    expect(validateLimits({ ...valid, monthlyCents: MAX_MONTHLY_CENTS + 1 })).toEqual({
      ok: false,
      fields: { monthlyCents: 'demasiado_alto' },
    })
  })

  it('reports several fields at once, one code per field', () => {
    expect(validateLimits({ perOperationCents: 0, dailyCents: 200_000, monthlyCents: 150_000 })).toEqual({
      ok: false,
      fields: {
        perOperationCents: 'debe_ser_positivo',
        dailyCents: 'mayor_que_mensual',
        monthlyCents: 'demasiado_alto',
      },
    })
  })

  it('a field that is not positive does not also get a comparison', () => {
    expect(validateLimits({ perOperationCents: 50, dailyCents: 0, monthlyCents: -5 })).toEqual({
      ok: false,
      fields: { dailyCents: 'debe_ser_positivo', monthlyCents: 'debe_ser_positivo' },
    })
  })

  it('only whole cents: anything else is no_valido', () => {
    expect(
      validateLimits({ perOperationCents: 50.5, dailyCents: Number.NaN, monthlyCents: Number.POSITIVE_INFINITY }),
    ).toEqual({
      ok: false,
      fields: { perOperationCents: 'no_valido', dailyCents: 'no_valido', monthlyCents: 'no_valido' },
    })
  })
})
