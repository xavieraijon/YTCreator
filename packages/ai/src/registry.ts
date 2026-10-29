import type { Billing, ConnectionKind, ProviderDescriptor } from '@ytcreator/core'
import { createFakeLogin } from './fake/fake-login.ts'
import { createFakeProvider } from './fake/fake-provider.ts'
import { parseScenario, type FakeScenario } from './fake/scenarios.ts'

export interface RegistryOptions {
  env: Record<string, string | undefined>
  // Replaced at build time: false in the published build, so the fake can never be switched on there.
  allowFake?: boolean
  now?: () => Date
}

interface Slot {
  id: string
  connectionKind: ConnectionKind
  billing: Billing
  label: string
}

const SLOTS: Slot[] = [
  { id: 'claude-code', connectionKind: 'suscripcion', billing: 'suscripcion', label: 'ai.provider.claude_code' },
  { id: 'anthropic', connectionKind: 'pago_por_uso', billing: 'por_uso', label: 'ai.provider.anthropic' },
]

function fakeDescriptor(slot: Slot, scenario: FakeScenario, now: () => Date): ProviderDescriptor {
  return {
    ...slot,
    create: (credentials, deps) => createFakeProvider(scenario, credentials, deps, { billing: slot.billing }),
    login: slot.connectionKind === 'suscripcion' ? createFakeLogin(scenario, now) : undefined,
  }
}

// One descriptor per connection kind; adding a subscription later is one more descriptor (FR-015).
// With `YTCREATOR_FAKE_AI` (and only in a build that allows it) every slot is backed by the fake provider.
export function createRegistry({
  env,
  allowFake = __YTC_ALLOW_FAKE_AI__,
  now = () => new Date(),
}: RegistryOptions): ProviderDescriptor[] {
  const scenarioName = env.YTCREATOR_FAKE_AI
  if (allowFake && scenarioName) {
    const scenario = parseScenario(scenarioName)
    return SLOTS.map((slot) => fakeDescriptor(slot, scenario, now))
  }
  // The real adapters arrive with US2 (T097).
  return []
}
