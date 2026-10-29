import type { Billing, ConnectionKind, Logger, ProviderDescriptor } from '@ytcreator/core'
import { createAnthropicProvider } from './anthropic/adapter.ts'
import { createClaudeCodeProvider } from './claude-code/adapter.ts'
import { createClaudeLogin } from './claude-code/login.ts'
import { createFakeLogin } from './fake/fake-login.ts'
import { createFakeProvider } from './fake/fake-provider.ts'
import { parseScenario, type FakeScenario } from './fake/scenarios.ts'

export interface RegistryOptions {
  env: Record<string, string | undefined>
  // Replaced at build time: false in the published build, so the fake can never be switched on there.
  allowFake?: boolean
  now?: () => Date
  logger?: Logger // for the subscription login, which outlives a single request
  claudeBin?: string // `claude` found at start-up; otherwise it is looked up in PATH
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
  logger = { info() {}, warn() {}, error() {} },
  claudeBin,
}: RegistryOptions): ProviderDescriptor[] {
  const scenarioName = env.YTCREATOR_FAKE_AI
  if (allowFake && scenarioName) {
    const scenario = parseScenario(scenarioName)
    return SLOTS.map((slot) => fakeDescriptor(slot, scenario, now))
  }
  const [subscription, payPerUse] = SLOTS as [Slot, Slot]
  return [
    {
      ...subscription,
      create: (credentials, deps) => createClaudeCodeProvider(credentials, { claudeBin, ...deps }, { env }),
      login: createClaudeLogin({ logger, now, claudeBin, env }),
    },
    { ...payPerUse, create: (credentials, deps) => createAnthropicProvider(credentials, deps) },
  ]
}
