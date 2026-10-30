import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Secret, UNKNOWN_FAILURE, type AiFailure, type Logger, type SubscriptionLogin } from '@ytcreator/core'
import { cleanEnv, resolveClaudeBin, type Env } from './command.ts'

const BAD_CODE: AiFailure = { kind: 'sin_sesion', reason: 'codigo_no_valido' }
const NOT_INSTALLED: AiFailure = { kind: 'no_disponible', reason: 'programa_no_instalado' }
const TIMED_OUT: AiFailure = { kind: 'tiempo_agotado', reason: 'respuesta_lenta' }

// A wide terminal keeps the link and the token on one line (spike S2); the parser copes with wrapping anyway.
const SETUP_TOKEN = 'stty cols 1000 2>/dev/null; exec "$YTC_CLAUDE_BIN" setup-token'
// The CLI opens a tab of its own (`$BROWSER <url>`, else `open`) with the automatic flow, whose callback goes to
// localhost and never shows a code to paste. `true` makes that a no-op, so the only link is the app's (T158).
const NO_BROWSER = 'true'
// macOS `script` reads the terminal settings of its stdin and fails on the socket Node gives it (EOPNOTSUPP, not
// ENOTTY), and on a FIFO too: `cat` hands it a shell pipe instead, and is killed when `script` ends so the exit shows.
const WRAPPER =
  'exec 3<&0; { cat <&3 & echo $! > feeder; wait; } | { "$@"; status=$?; kill "$(cat feeder)" 2>/dev/null; exit $status; }'

// The link is the target of the first OSC 8 hyperlink: `ESC]8;id=…;<url>` ended by BEL or `ESC\`.
// eslint-disable-next-line no-control-regex -- it parses the escape sequences of a terminal
const LINK = /\x1b\]8;[^;\x07\x1b]*;(https:\/\/[^\x07\x1b]+)(?:\x07|\x1b\\)/
const TOKEN_START = 'sk-ant-oat01-'
// The token is painted in a colour: it ends where the colour is reset.
const TOKEN_END = '\x1b[39m'
// eslint-disable-next-line no-control-regex -- likewise
const CONTROL = /\x1b\[[0-9;?<>]*[A-Za-z]|[\r\n\s]/g
const TOKEN = /^sk-ant-oat01-[\w-]+$/

export interface ClaudeLoginOptions {
  logger: Logger
  now?: () => Date
  claudeBin?: string
  env?: Env
  platform?: NodeJS.Platform
  linkTimeoutMs?: number
  tokenTimeoutMs?: number
  expiresMs?: number
}

interface Session {
  loginId: string
  child: ChildProcess
  dir: string
  output: string
  exitCode: number | null | undefined // undefined while it runs
  expiresAt: number
  timer: NodeJS.Timeout
  listeners: Set<() => void>
}

// `script` gives `claude setup-token` the terminal it needs (research R11): macOS and util-linux differ.
function scriptArgs(platform: NodeJS.Platform): string[] {
  const script =
    platform === 'darwin' ? ['-q', '/dev/null', 'sh', '-c', SETUP_TOKEN] : ['-qec', SETUP_TOKEN, '/dev/null']
  return ['-c', WRAPPER, 'sh', 'script', ...script]
}

export function extractLink(output: string): string | null {
  return LINK.exec(output)?.[1] ?? null
}

// The token comes split across lines by cursor moves (S2): the pieces are joined without the control sequences.
export function extractToken(output: string): string | null {
  const start = output.indexOf(TOKEN_START)
  if (start < 0) return null
  const end = output.indexOf(TOKEN_END, start)
  if (end < 0) return null
  const token = output.slice(start, end).replace(CONTROL, '')
  return TOKEN.test(token) ? token : null
}

// Claude subscription login without a terminal for the creator (FR-016). The output of the process is never
// logged: it holds the token. One login at a time, like the CLI; starting another ends the open one.
export function createClaudeLogin(options: ClaudeLoginOptions): SubscriptionLogin {
  const { logger, now = () => new Date(), platform = process.platform } = options
  const env = options.env ?? process.env
  const bin = options.claudeBin ?? resolveClaudeBin(env)
  const linkTimeoutMs = options.linkTimeoutMs ?? 20_000
  const tokenTimeoutMs = options.tokenTimeoutMs ?? 30_000
  const expiresMs = options.expiresMs ?? 10 * 60_000
  let open: Session | null = null

  function end(session: Session) {
    if (open === session) open = null
    clearTimeout(session.timer)
    if (session.exitCode === undefined) {
      // The wrapper leads its own group (`cat`, `script` and the CLI).
      try {
        process.kill(-session.child.pid!, 'SIGKILL')
      } catch {
        session.child.kill('SIGKILL')
      }
    }
    rmSync(session.dir, { recursive: true, force: true })
  }

  // Resolves with the value as soon as `read` finds it, or null when the process ends or time runs out.
  function waitFor<T>(session: Session, read: (output: string) => T | null, timeoutMs: number) {
    return new Promise<{ value: T } | { value: null; timedOut: boolean }>((resolve) => {
      const check = () => {
        const value = read(session.output)
        if (value !== null) done({ value })
        else if (session.exitCode !== undefined) done({ value: null, timedOut: false })
      }
      const timer = setTimeout(() => done({ value: null, timedOut: true }), timeoutMs)
      const done = (result: { value: T } | { value: null; timedOut: boolean }) => {
        clearTimeout(timer)
        session.listeners.delete(check)
        resolve(result)
      }
      session.listeners.add(check)
      check()
    })
  }

  function launch(): Session {
    const dir = mkdtempSync(join(tmpdir(), 'ytcreator-login-'))
    const child = spawn('sh', scriptArgs(platform), {
      cwd: dir,
      env: cleanEnv(env, { CLAUDE_CONFIG_DIR: dir, YTC_CLAUDE_BIN: bin, BROWSER: NO_BROWSER }),
      stdio: ['pipe', 'pipe', 'ignore'],
      detached: true,
    })
    const session: Session = {
      loginId: randomUUID(),
      child,
      dir,
      output: '',
      exitCode: undefined,
      expiresAt: now().getTime() + expiresMs,
      timer: setTimeout(() => end(session), expiresMs),
      listeners: new Set(),
    }
    session.timer.unref()
    const notify = () => session.listeners.forEach((listener) => listener())
    child.stdout!.setEncoding('utf8')
    child.stdout!.on('data', (chunk: string) => {
      session.output += chunk
      notify()
    })
    child.on('error', () => {
      session.exitCode = null
      notify()
    })
    child.on('close', (code) => {
      session.exitCode = code
      notify()
    })
    child.stdin!.on('error', () => undefined)
    return session
  }

  return {
    async start() {
      if (open) end(open)
      const session = launch()
      open = session
      const link = await waitFor(session, extractLink, linkTimeoutMs)
      if (link.value === null) {
        const exitCode = session.exitCode
        end(session)
        logger.warn('ai.login_failed', { provider: 'claude-code', stage: 'link', exitCode, timedOut: link.timedOut })
        if (link.timedOut) return { ok: false, failure: TIMED_OUT }
        // `sh` says 127 for a missing command and 126 for a path it cannot run.
        return { ok: false, failure: exitCode === 126 || exitCode === 127 ? NOT_INSTALLED : UNKNOWN_FAILURE }
      }
      logger.info('ai.login_started', { provider: 'claude-code' })
      const value = { loginId: session.loginId, url: link.value, expiresAt: new Date(session.expiresAt).toISOString() }
      return { ok: true, value }
    },

    async complete(loginId, code) {
      const session = open
      if (!session || session.loginId !== loginId) return { ok: false, failure: BAD_CODE }
      if (now().getTime() >= session.expiresAt || session.exitCode !== undefined) {
        end(session)
        return { ok: false, failure: BAD_CODE }
      }
      // From here on the session is used up, whatever the result: a new attempt asks for a new link.
      open = null
      session.child.stdin!.write(`${code.reveal()}\r`)
      const token = await waitFor(session, extractToken, tokenTimeoutMs)
      const exitCode = session.exitCode
      end(session)
      if (token.value === null) {
        logger.warn('ai.login_failed', { provider: 'claude-code', stage: 'token', exitCode, timedOut: token.timedOut })
        return { ok: false, failure: BAD_CODE }
      }
      logger.info('ai.login_completed', { provider: 'claude-code' })
      return { ok: true, token: Secret.from(token.value) }
    },

    async cancel(loginId) {
      if (open?.loginId === loginId) end(open)
    },
  }
}
