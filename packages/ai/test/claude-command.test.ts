import { Secret } from '@ytcreator/core'
import { describe, expect, it } from 'vitest'
import { buildClaudeCommand } from '../src/claude-code/command.ts'
import { resolveProfile } from '../src/profiles.ts'

const build = (request: { jsonSchema?: unknown; web?: boolean }) =>
  buildClaudeCommand(
    resolveProfile('claude-code', 'investigacion'),
    { token: Secret.from('sk-ant-oat01-FAKE-0123456789'), configDir: '/tmp/cuenta' },
    request,
    { PATH: '/bin', HOME: '/h', ANTHROPIC_API_KEY: 'no-debe-pasar' },
  )

const valueOf = (args: string[], flag: string) => args[args.indexOf(flag) + 1]

const ISOLATION = ['--strict-mcp-config', '--no-session-persistence', '--disable-slash-commands'] as const

describe('claude code: the search tools', () => {
  it('gives the two tools only with `web`', () => {
    const { args } = build({ web: true, jsonSchema: {} })
    expect(valueOf(args, '--tools')).toBe('WebSearch,WebFetch')
    const allowed = args.indexOf('--allowedTools')
    expect(args.slice(allowed + 1, allowed + 3)).toEqual(['WebSearch', 'WebFetch'])
  })

  it('gives no tools otherwise', () => {
    const { args } = build({ jsonSchema: {} })
    expect(valueOf(args, '--tools')).toBe('')
    expect(args).not.toContain('--allowedTools')
    expect(args.join(' ')).not.toContain('WebSearch')
  })

  it('never allows anything that runs commands or reads files', () => {
    expect(build({ web: true }).args.join(' ')).not.toMatch(/Bash|Read|Write|Edit|Glob|Grep/)
  })

  it.each([true, false])('keeps the isolation flags (web: %s)', (web) => {
    const { args, env } = build({ web })
    for (const flag of ISOLATION) expect(args).toContain(flag)
    expect(valueOf(args, '--setting-sources')).toBe('')
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(args.join(' ')).not.toContain('sk-ant')
  })

  it('still asks for the JSON format', () => {
    expect(build({ web: true, jsonSchema: { type: 'object' } }).args).toContain('--json-schema')
  })
})
