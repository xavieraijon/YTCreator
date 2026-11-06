import { spawn } from 'node:child_process'

export interface YtDlpRun {
  exitCode: number | null
  stdout: string
  stderr: string
  spawnError?: string // `code` of the error when the program could not start (ENOENT…)
  aborted: boolean
}

// Runs yt-dlp with its arguments as a list and no shell, so nothing the creator types is ever interpreted.
// stderr is kept only to classify the failure; neither stream is logged.
export function runYtDlp(
  bin: string,
  args: string[],
  options: { signal?: AbortSignal; env?: Record<string, string> } = {},
): Promise<YtDlpRun> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (result: Omit<YtDlpRun, 'stdout' | 'stderr'>) => {
      if (settled) return
      settled = true
      options.signal?.removeEventListener('abort', onAbort)
      resolve({ ...result, stdout, stderr })
    }
    const env = options.env ?? minimalEnv()
    const child = spawn(bin, args, { env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
    const onAbort = () => {
      child.kill('SIGKILL')
      finish({ exitCode: null, aborted: true })
    }
    if (options.signal?.aborted) return onAbort()
    options.signal?.addEventListener('abort', onAbort, { once: true })
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => (stdout += chunk))
    child.stderr.on('data', (chunk: string) => (stderr += chunk))
    child.on('error', (error: NodeJS.ErrnoException) =>
      finish({ exitCode: null, spawnError: error.code, aborted: false }),
    )
    child.on('close', (code) => finish({ exitCode: code, aborted: false }))
  })
}

// yt-dlp needs nothing of the server's environment, and must not see its secrets.
function minimalEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const key of ['PATH', 'HOME', 'LANG', 'SYSTEMROOT', 'TEMP', 'TMP']) {
    const value = process.env[key]
    if (value !== undefined) env[key] = value
  }
  return env
}
