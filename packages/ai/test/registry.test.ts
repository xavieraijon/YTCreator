import { CONNECTION_KINDS, Secret, type ProviderDeps } from '@ytcreator/core'
import { describe, expect, it } from 'vitest'
import { createRegistry } from '../src/registry.ts'

const deps: ProviderDeps = {
  fetch: (() => Promise.reject(new Error('sin red'))) as typeof fetch,
  now: () => new Date(),
  logger: { info() {}, warn() {}, error() {} },
}

describe('createRegistry', () => {
  it('never offers the fake provider when the build forbids it, even with YTCREATOR_FAKE_AI', () => {
    const registry = createRegistry({ env: { YTCREATOR_FAKE_AI: 'ok' }, allowFake: false })
    for (const descriptor of registry) {
      expect(descriptor.id).not.toBe('fake')
      expect(descriptor.create(Secret.from('sk-ant-api03-FAKE-0123456789'), deps).id).not.toBe('fake')
    }
  })

  it('backs the three real descriptors with the fake when allowed and asked for', () => {
    const registry = createRegistry({ env: { YTCREATOR_FAKE_AI: 'ok' }, allowFake: true })
    expect(registry.map((d) => d.id).sort()).toEqual(['anthropic', 'claude-code'])
    for (const descriptor of registry) {
      expect(descriptor.create(Secret.from('sk-ant-api03-FAKE-0123456789'), deps).id).toBe('fake')
    }
  })

  it('has exactly one descriptor per connection kind, and a login only for the subscription', () => {
    const registry = createRegistry({ env: { YTCREATOR_FAKE_AI: 'ok' }, allowFake: true })
    expect(registry.map((d) => d.connectionKind).sort()).toEqual([...CONNECTION_KINDS].sort())
    for (const descriptor of registry) {
      expect(descriptor.login !== undefined).toBe(descriptor.connectionKind === 'suscripcion')
    }
    expect(registry.find((d) => d.connectionKind === 'pago_por_uso')?.billing).toBe('por_uso')
  })

  it('without the fake, offers the real adapters: claude-code with its login and anthropic', () => {
    const registry = createRegistry({ env: {}, allowFake: true, claudeBin: '/no/existe/claude' })
    const byKind = Object.fromEntries(registry.map((d) => [d.connectionKind, d]))
    expect(byKind.suscripcion).toMatchObject({ id: 'claude-code', billing: 'suscripcion' })
    expect(byKind.suscripcion!.login).toBeDefined()
    expect(byKind.pago_por_uso).toMatchObject({ id: 'anthropic', billing: 'por_uso' })
    expect(byKind.pago_por_uso!.login).toBeUndefined()
    // Creating a provider neither reaches the network nor starts the CLI.
    const secret = Secret.from('sk-ant-api03-FAKE-0123456789')
    expect(byKind.suscripcion!.create(secret, deps).id).toBe('claude-code')
    expect(byKind.pago_por_uso!.create(secret, deps).id).toBe('anthropic')
  })

  it('refuses an unknown scenario name', () => {
    expect(() => createRegistry({ env: { YTCREATOR_FAKE_AI: 'okk' }, allowFake: true })).toThrow(/okk/)
  })

  it('ignores YTCREATOR_FAKE_AI when it is empty', () => {
    const registry = createRegistry({ env: { YTCREATOR_FAKE_AI: '' }, allowFake: true })
    expect(registry.every((d) => d.id !== 'fake')).toBe(true)
  })
})
