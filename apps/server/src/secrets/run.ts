import { spawn } from 'node:child_process'

export interface ToolOptions {
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
}

export interface ToolResult {
  // null when the tool could not start, was killed or ran out of time.
  exitCode: number | null
  stdout: string
}

// Runs a system tool without a shell. Secrets only travel through `input` (stdin), never through `args` (`ps`).
export function runTool(command: string, args: string[], input: string | null, options: ToolOptions = {}) {
  return new Promise<ToolResult>((resolve) => {
    const child = spawn(command, args, { env: options.env ?? process.env, stdio: ['pipe', 'pipe', 'ignore'] })
    let stdout = ''
    let settled = false
    const finish = (exitCode: number | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ exitCode, stdout })
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish(null)
    }, options.timeoutMs ?? 10_000)
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => (stdout += chunk))
    child.on('error', () => finish(null))
    child.on('close', (code) => finish(code))
    child.stdin.on('error', () => undefined)
    child.stdin.end(input ?? '')
  })
}
