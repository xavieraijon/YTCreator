import { Secret } from '@ytcreator/core'
import { createFakeProvider } from '../../src/fake/fake-provider.ts'
import { parseScenario } from '../../src/fake/scenarios.ts'
import { resolveProfile } from '../../src/profiles.ts'
import { INVALID_OUTPUT, runProviderContract, useOutputs, VALID_OUTPUT, type ContractCase } from './battery.ts'

const KEY = 'sk-ant-api03-FAKE-contract-0123456789'

const SCENARIOS: Partial<Record<ContractCase, string>> = {
  no_permission: 'sin_sesion:plan_sin_acceso',
  quota: 'cupo:2026-10-28T12:00:00.000Z',
  offline: 'no_disponible:sin_conexion',
  timeout: 'lento',
  service_down: 'no_disponible:servicio_caido',
  filtered: 'contenido_filtrado:rechazo_del_modelo',
  web_unsupported: 'sin_web',
}

const OUTPUTS: Partial<Record<ContractCase, unknown[]>> = {
  output_valid: [VALID_OUTPUT],
  output_invalid_then_valid: [INVALID_OUTPUT, VALID_OUTPUT],
  output_invalid_twice: [INVALID_OUTPUT, INVALID_OUTPUT],
  web_valid: [VALID_OUTPUT, VALID_OUTPUT],
}

runProviderContract('fake', (stub, deps) => {
  let calls = 0
  const outputs = [...(OUTPUTS[stub] ?? useOutputs(stub) ?? [])]
  const credential = stub === 'invalid_credential' ? 'sk-ant-api03-REAL-not-accepted-0123' : KEY
  const aiTimeoutSeconds = stub === 'timeout' ? 1 : undefined
  const provider = createFakeProvider(
    parseScenario(SCENARIOS[stub] ?? 'ok'),
    Secret.from(credential),
    { ...deps, aiTimeoutSeconds },
    {
      transport: async () => {
        calls += 1
        if (stub === 'unknown_error') throw new TypeError(`fallo raro con ${credential}`)
        return outputs.shift() ?? 'listo'
      },
    },
  )
  return {
    provider,
    calls: () => calls,
    credential,
    timeoutMs: resolveProfile('fake', 'comprobacion', { aiTimeoutSeconds }).timeoutMs,
  }
})
