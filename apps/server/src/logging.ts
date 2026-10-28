import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Logger } from '@ytcreator/core'

const HIDDEN = '[oculto]'
const KEY_PATTERNS = [/sk-ant-[A-Za-z0-9_-]{8,}/g, /AIza[0-9A-Za-z_-]{35}/g]
const SENSITIVE_FIELDS = new Set(['apikey', 'token', 'code', 'authorization', 'x-api-key', 'x-goog-api-key'])

const FILE = 'server.log'
const KEEP = 3

export interface LoggerOptions {
  now?: () => Date
  maxBytes?: number
}

// Last line of defence (R22): whatever reached the line, key patterns never reach the disk.
export function redactLine(line: string): string {
  return KEY_PATTERNS.reduce((text, pattern) => text.replace(pattern, HIDDEN), line)
}

function replacer(key: string, value: unknown): unknown {
  if (SENSITIVE_FIELDS.has(key.toLowerCase())) return HIDDEN
  if (value instanceof Error) return { name: value.name, message: value.message }
  return value
}

export function formatLine(level: string, event: string, fields: Record<string, unknown>, now: Date): string {
  return redactLine(JSON.stringify({ ts: now.toISOString(), level, event, ...fields }, replacer))
}

function rotate(dir: string) {
  rmSync(join(dir, `${FILE}.${KEEP - 1}`), { force: true })
  for (let i = KEEP - 2; i >= 1; i--) {
    const from = join(dir, `${FILE}.${i}`)
    if (existsSync(from)) renameSync(from, join(dir, `${FILE}.${i + 1}`))
  }
  renameSync(join(dir, FILE), join(dir, `${FILE}.1`))
}

// JSON lines in APP_HOME/logs/server.log; rotates at 5 MB and keeps 3 files (R22).
export function createLogger(
  dir: string,
  { now = () => new Date(), maxBytes = 5 * 1024 * 1024 }: LoggerOptions = {},
): Logger {
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const path = join(dir, FILE)
  let size = existsSync(path) ? statSync(path).size : 0

  const write = (level: string, event: string, fields: Record<string, unknown> = {}) => {
    const line = formatLine(level, event, fields, now()) + '\n'
    const bytes = Buffer.byteLength(line)
    if (size > 0 && size + bytes > maxBytes) {
      rotate(dir)
      size = 0
    }
    appendFileSync(path, line, { mode: 0o600 })
    size += bytes
  }

  return {
    info: (event, fields) => write('info', event, fields),
    warn: (event, fields) => write('warn', event, fields),
    error: (event, fields) => write('error', event, fields),
  }
}

// For tests: keeps the redacted lines in memory.
export function createMemoryLogger(now: () => Date = () => new Date()): Logger & { lines: string[] } {
  const lines: string[] = []
  const write =
    (level: string) =>
    (event: string, fields: Record<string, unknown> = {}) => {
      lines.push(formatLine(level, event, fields, now()))
    }
  return { info: write('info'), warn: write('warn'), error: write('error'), lines }
}
