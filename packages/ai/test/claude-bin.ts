import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const FAKE = join(import.meta.dirname, 'fixtures', 'fake-claude.mjs')

export interface FakeClaudeState {
  scenario?: string // ok | fixture:<name> | status:<n> | refusal | garbage | hang | output
  scenarios?: string[] // one per `-p` call, overriding `scenario`
  outputs?: unknown[] // `structured_output` of each `-p` call with the `output` scenario
  text?: string // `result` of the `ok` scenario
  loginCode?: string
  login?: 'hang'
}

export interface Call {
  argv: string[]
  env: Record<string, string>
  prompt: string
}

// A `claude` of its own per test: a wrapper that points fake-claude at a fresh folder with the scenario.
export function createFakeClaude(state: FakeClaudeState = {}) {
  const dir = mkdtemp('ytc-fake-claude-')
  writeFileSync(join(dir, 'state.json'), JSON.stringify(state))
  const bin = join(dir, 'claude')
  writeFileSync(bin, `#!/bin/sh\nFAKE_CLAUDE_DIR='${dir}' exec '${process.execPath}' '${FAKE}' "$@"\n`)
  chmodSync(bin, 0o755)
  const read = (name: string) => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), 'utf8') : '')

  return {
    bin,
    dir,
    calls: (): Call[] =>
      read('calls.log')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Call),
    loginPid: (): number | null => (read('login.pid') ? Number(read('login.pid')) : null),
    loginDir: (): string => read('login.dir'),
    loginBrowser: (): string => read('login.browser'),
  }
}

export function mkdtemp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
