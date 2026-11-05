import {
  CHANNEL_OUTPUTS,
  checkClaims,
  type AiProvider,
  type ChannelUse,
  type Logger,
  type ProviderDeps,
} from '@ytcreator/core'
import { COMPROBACION } from '@ytcreator/knowledge'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { fakeChannelOutput } from '../../src/fake/outputs.ts'

// The stub each adapter sets up so its transport produces the case (contracts/ai-provider.md, C1–C13).
export type BaseCase =
  | 'valid_credential'
  | 'invalid_credential'
  | 'no_permission'
  | 'quota'
  | 'offline'
  | 'timeout'
  | 'service_down'
  | 'filtered'
  | 'unknown_error'
  | 'output_valid'
  | 'output_invalid_then_valid'
  | 'output_invalid_twice'

// The channel uses of the 003: valid output, invalid twice and an invented figure (contracts/ai-uses.md, «Pruebas»).
export const CHANNEL_USES = Object.keys(CHANNEL_OUTPUTS) as ChannelUse[]
export type UseCase = `use_valid:${ChannelUse}` | `use_invalid_twice:${ChannelUse}` | `use_invented:${ChannelUse}`
export type ContractCase = BaseCase | UseCase

// What the channel readings get: the figures and videos the output may cite.
export const USE_INPUT = { videos: [{ videoId: 'vid-abc', title: 'Cena en diez minutos', views: 1200 }] }

// The raw outputs the transport gives for a use case, in order; undefined for the base cases.
export function useOutputs(stub: ContractCase): unknown[] | undefined {
  const [kind, use] = stub.split(':') as [string, ChannelUse | undefined]
  if (!use) return undefined
  if (kind === 'use_valid') return [fakeChannelOutput(use, USE_INPUT, 'normal')]
  if (kind === 'use_invented') return [fakeChannelOutput(use, USE_INPUT, 'cifra_inventada')]
  return [fakeChannelOutput(use, USE_INPUT, 'salida_rota'), fakeChannelOutput(use, USE_INPUT, 'salida_rota')]
}

export interface ContractSubject {
  provider: AiProvider
  calls(): number // calls that reached the transport
  credential: string // the raw credential, to search for it (C13)
  timeoutMs: number
}

export interface ContractOptions {
  // Cases an adapter cannot produce, with the reason in the test name.
  skip?: Partial<Record<ContractCase, string>>
}

export type ContractFactory = (stub: ContractCase, deps: ProviderDeps) => ContractSubject | Promise<ContractSubject>

// Valid output for the structured cases; the invalid stubs return anything else.
export const CONTRACT_SCHEMA = z.object({ palabra: z.literal('listo') })
export const VALID_OUTPUT = { palabra: 'listo' }
export const INVALID_OUTPUT = { palabra: 42 }

const FAILURE_CASES: Record<string, { stub: ContractCase; kind: string; reasons: string[] }> = {
  C2: { stub: 'invalid_credential', kind: 'sin_sesion', reasons: ['clave_no_valida', 'sesion_caducada'] },
  C3: { stub: 'no_permission', kind: 'sin_sesion', reasons: ['sin_permiso', 'plan_sin_acceso'] },
  C4: { stub: 'quota', kind: 'cupo_agotado', reasons: ['sin_saldo', 'limite_de_uso'] },
  C5: { stub: 'offline', kind: 'no_disponible', reasons: ['sin_conexion'] },
  C6: { stub: 'timeout', kind: 'tiempo_agotado', reasons: ['respuesta_lenta'] },
  C7: { stub: 'service_down', kind: 'no_disponible', reasons: ['servicio_caido'] },
  C8: { stub: 'filtered', kind: 'contenido_filtrado', reasons: ['rechazo_del_modelo'] },
  C9: { stub: 'unknown_error', kind: 'no_disponible', reasons: ['servicio_caido'] },
}

// Captures every log line unredacted: the credential must not even reach the logger.
function capturingDeps(): { deps: ProviderDeps; lines: string[] } {
  const lines: string[] = []
  const write = (event: string, fields?: Record<string, unknown>) => {
    lines.push(
      JSON.stringify({ event, ...fields }, (_key, value: unknown) => (value instanceof Error ? String(value) : value)),
    )
  }
  const logger: Logger = { info: write, warn: write, error: write }
  const fetch = (() => Promise.reject(new Error('fetch sin stub en la batería'))) as typeof globalThis.fetch
  return { deps: { fetch, now: () => new Date(), logger }, lines }
}

export function runProviderContract(name: string, factory: ContractFactory, options: ContractOptions = {}) {
  const skip = options.skip ?? {}
  const caseIt = (stub: ContractCase, title: string, body: () => Promise<void>, timeout?: number) => {
    const reason = skip[stub]
    if (reason) it.skip(`${title} (no aplica: ${reason})`, body)
    else it(title, body, timeout)
  }

  describe(`contrato AiProvider: ${name}`, () => {
    caseIt('valid_credential', 'C1 credencial válida → check ok', async () => {
      const { deps } = capturingDeps()
      const subject = await factory('valid_credential', deps)
      expect(await subject.provider.check()).toEqual({ ok: true })
    })

    for (const [id, expected] of Object.entries(FAILURE_CASES)) {
      caseIt(
        expected.stub,
        `${id} ${expected.stub} → ${expected.kind}, una llamada como mucho (C12)`,
        async () => {
          const { deps, lines } = capturingDeps()
          const subject = await factory(expected.stub, deps)
          const startedAt = Date.now()
          const result = await subject.provider.check()
          const elapsed = Date.now() - startedAt

          expect(result.ok).toBe(false)
          if (result.ok) return
          expect(result.failure.kind).toBe(expected.kind)
          expect(expected.reasons).toContain(result.failure.reason)
          if (result.failure.resetsAt !== undefined) expect(Date.parse(result.failure.resetsAt)).not.toBeNaN()
          if (expected.stub === 'timeout') expect(elapsed).toBeLessThanOrEqual(subject.timeoutMs + 1000)
          expect(subject.calls()).toBeLessThanOrEqual(1)
          // C13: nor in the logs, the result or the provider itself.
          const exposed = [...lines, JSON.stringify(result), JSON.stringify(subject.provider)].join('\n')
          expect(exposed).not.toContain(subject.credential)
        },
        30_000,
      )
    }

    caseIt('output_valid', 'C10 generate con schema y salida válida → valor tipado', async () => {
      const { deps } = capturingDeps()
      const subject = await factory('output_valid', deps)
      const result = await subject.provider.generate({
        use: 'comprobacion',
        prompt: COMPROBACION,
        schema: CONTRACT_SCHEMA,
      })
      expect(result).toMatchObject({ ok: true, value: VALID_OUTPUT })
      expect(subject.calls()).toBe(1)
    })

    caseIt('output_invalid_then_valid', 'C11 salida inválida y después válida → un reintento y ok', async () => {
      const { deps } = capturingDeps()
      const subject = await factory('output_invalid_then_valid', deps)
      const result = await subject.provider.generate({
        use: 'comprobacion',
        prompt: COMPROBACION,
        schema: CONTRACT_SCHEMA,
      })
      expect(result).toMatchObject({ ok: true, value: VALID_OUTPUT })
      expect(subject.calls()).toBe(2)
    })

    caseIt(
      'output_invalid_twice',
      'C11 dos salidas inválidas → servicio_caido con invalidOutput tras un único reintento',
      async () => {
        const { deps, lines } = capturingDeps()
        const subject = await factory('output_invalid_twice', deps)
        const result = await subject.provider.generate({
          use: 'comprobacion',
          prompt: COMPROBACION,
          schema: CONTRACT_SCHEMA,
        })
        expect(result).toEqual({
          ok: false,
          failure: { kind: 'no_disponible', reason: 'servicio_caido' },
          invalidOutput: true,
          usage: expect.any(Object),
        })
        // The two attempts were consumed even if nothing came out of them.
        expect((result as { usage?: { inputTokens?: number } }).usage?.inputTokens).toBeGreaterThan(0)
        expect(subject.calls()).toBe(2)
        // The validation failure is logged without the content.
        expect(lines.join('\n')).not.toContain('42')
      },
    )

    for (const use of CHANNEL_USES) {
      const request = {
        use,
        prompt: { id: use, version: 1, text: 'Prueba de contrato.' },
        input: USE_INPUT,
        schema: CHANNEL_OUTPUTS[use] as z.ZodType<unknown>,
      }

      caseIt(`use_valid:${use}`, `U1 ${use}: salida válida → valor del esquema del uso`, async () => {
        const { deps } = capturingDeps()
        const subject = await factory(`use_valid:${use}`, deps)
        const result = await subject.provider.generate(request)
        expect(result).toMatchObject({ ok: true, value: useOutputs(`use_valid:${use}`)![0] })
        expect(subject.calls()).toBe(1)
      })

      caseIt(
        `use_invalid_twice:${use}`,
        `U2 ${use}: dos salidas inválidas → invalidOutput tras un único reintento`,
        async () => {
          const { deps } = capturingDeps()
          const subject = await factory(`use_invalid_twice:${use}`, deps)
          const result = await subject.provider.generate(request)
          expect(result).toMatchObject({ ok: false, invalidOutput: true })
          expect(subject.calls()).toBe(2)
        },
      )

      // The adapter gives it back as is: the figure validator lives in the server (ai-run), not in the port.
      caseIt(
        `use_invented:${use}`,
        `U3 ${use}: cifra inventada → llega tal cual y el validador la detecta`,
        async () => {
          const { deps } = capturingDeps()
          const subject = await factory(`use_invented:${use}`, deps)
          const result = await subject.provider.generate(request)
          expect(result.ok).toBe(true)
          if (!result.ok) return
          expect(checkClaims(result.value, USE_INPUT).length).toBeGreaterThan(0)
          expect(subject.calls()).toBe(1)
        },
      )
    }

    caseIt('valid_credential', 'C13 la credencial no aparece al serializar el proveedor', async () => {
      const { deps, lines } = capturingDeps()
      const subject = await factory('valid_credential', deps)
      await subject.provider.check()
      const exposed = [...lines, JSON.stringify(subject.provider), String(subject.provider)].join('\n')
      expect(exposed).not.toContain(subject.credential)
    })
  })
}
