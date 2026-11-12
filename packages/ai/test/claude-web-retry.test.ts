import { Secret, type Logger } from '@ytcreator/core'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createClaudeCodeProvider } from '../src/claude-code/adapter.ts'
import { createFakeClaude, mkdtemp } from './claude-bin.ts'

const silent: Logger = { info() {}, warn() {}, error() {} }
const schema = z.object({ palabra: z.literal('listo') })

describe('claude code: an answer that does not validate (R4, decision 39)', () => {
  it('asks for the format again without searching again', async () => {
    const fake = createFakeClaude({ scenario: 'output', outputs: [{ palabra: 42 }, { palabra: 'listo' }] })
    const provider = createClaudeCodeProvider(
      Secret.from('sk-ant-oat01-FAKE-web-0123456789'),
      { fetch, now: () => new Date(), logger: silent, claudeBin: fake.bin, accountDir: mkdtemp('ytc-account-') },
      { env: { PATH: process.env['PATH'] } },
    )
    const result = await provider.generate({
      use: 'investigacion',
      prompt: { id: 'investigacion', version: 1, text: 'Investiga.' },
      input: { idea: 'pan' },
      schema,
      web: { maxSearches: 2, maxFetches: 2 },
    })
    expect(result).toMatchObject({ ok: true, value: { palabra: 'listo' } })
    const [first, second] = fake.calls()
    expect(first!.argv.join(' ')).toContain('WebSearch,WebFetch')
    expect(first!.prompt).toContain('Haz como mucho 2 búsquedas')
    expect(second!.argv.join(' ')).not.toContain('WebSearch')
    expect(second!.prompt).toContain('informe_web')
  })
})
