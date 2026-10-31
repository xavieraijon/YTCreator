import { describe, expect, it } from 'vitest'
import { aiFailureSchema, credentialBodySchema, labelSchema, stepBodySchema } from '../../src/api/index.ts'
import { Secret } from '../../src/secrets/secret.ts'

describe('api schemas', () => {
  it('requires kind with elegir and drops it otherwise', () => {
    expect(stepBodySchema.safeParse({ expectedRevision: 0, action: 'elegir' }).success).toBe(false)
    expect(stepBodySchema.parse({ expectedRevision: 0, action: 'elegir', kind: 'pago_por_uso' })).toMatchObject({
      kind: 'pago_por_uso',
    })
    expect(
      stepBodySchema.parse({ expectedRevision: 1, action: 'continuar', kind: 'pago_por_uso' }).kind,
    ).toBeUndefined()
  })

  it('rejects a reason that does not belong to its kind', () => {
    expect(aiFailureSchema.safeParse({ kind: 'sin_sesion', reason: 'clave_no_valida' }).success).toBe(true)
    expect(aiFailureSchema.safeParse({ kind: 'cupo_agotado', reason: 'clave_no_valida' }).success).toBe(false)
  })

  it('turns a credential into a trimmed Secret and rejects a blank one', () => {
    const { key } = credentialBodySchema.parse({ key: '  sk-ant-api03-FAKEkey1234 \n' })
    expect(key).toBeInstanceOf(Secret)
    expect(key.hint()).toBe('1234')
    expect(JSON.stringify({ key })).not.toContain('sk-ant')
    expect(credentialBodySchema.safeParse({ key: '   ' }).success).toBe(false)
  })

  it('accepts labels of 1 to 40 characters', () => {
    expect(labelSchema.safeParse('a'.repeat(40)).success).toBe(true)
    expect(labelSchema.safeParse('a'.repeat(41)).success).toBe(false)
    expect(labelSchema.safeParse('  ').success).toBe(false)
  })
})
