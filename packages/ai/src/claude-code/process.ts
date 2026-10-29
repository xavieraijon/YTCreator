import { spawn } from 'node:child_process'

export interface RunOptions {
  env: Record<string, string>
  cwd?: string
  input?: string
  signal?: AbortSignal
}

export interface RunResult {
  exitCode: number | null
  stdout: string
  spawnError?: string // `code` of the error when the program could not start (ENOENT…)
  aborted: boolean
}

// Runs the CLI without a shell. The output stays in memory and is only parsed, never logged (it may hold the token).
export function runClaude(bin: string, args: string[], options: RunOptions): Promise<RunResult> {
  return new Promise((resolve) => {
    let stdout = ''
    let settled = false
    const finish = (result: Omit<RunResult, 'stdout'>) => {
      if (settled) return
      settled = true
      options.signal?.removeEventListener('abort', onAbort)
      resolve({ ...result, stdout })
    }
    const child = spawn(bin, args, { cwd: options.cwd, env: options.env, stdio: ['pipe', 'pipe', 'ignore'] })
    const onAbort = () => {
      child.kill('SIGKILL')
      finish({ exitCode: null, aborted: true })
    }
    if (options.signal?.aborted) return onAbort()
    options.signal?.addEventListener('abort', onAbort, { once: true })
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => (stdout += chunk))
    child.on('error', (error: NodeJS.ErrnoException) =>
      finish({ exitCode: null, spawnError: error.code, aborted: false }),
    )
    child.on('close', (code) => finish({ exitCode: code, aborted: false }))
    child.stdin.on('error', () => undefined)
    child.stdin.end(options.input ?? '')
  })
}
