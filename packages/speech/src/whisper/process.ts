import { spawn } from 'node:child_process'
import { parseVadLine, type VadSegment } from './parse.ts'

export interface WhisperRun {
  exitCode: number | null
  signal: NodeJS.Signals | null
  /** The end of stderr, only to classify a failure; never logged. */
  stderr: string
  spawnError?: string
  aborted: boolean
  /** The stretches of voice it kept, read as they are said (they come first, so the end of stderr may not hold them). */
  vad: VadSegment[]
}

const STDERR_KEEP = 16_384
// Far more than three hours of audio can split into; a longer line than this is not one of them.
const VAD_KEEP = 100_000
const LINE_KEEP = 4_096
const PROGRESS = /progress\s*=\s*(\d{1,3})%/g

// Runs whisper-cli without a shell, in its own process group so that stopping it leaves nothing behind (contract,
// rule 2). What it prints of the text goes nowhere: stdout is ignored and stderr is only read for the progress.
export function runWhisper(
  bin: string,
  args: string[],
  options: { env: Record<string, string>; signal: AbortSignal; onPercent: (percent: number) => void },
): Promise<WhisperRun> {
  return new Promise((resolve) => {
    let stderr = ''
    let line = ''
    const vad: VadSegment[] = []
    let aborted = false
    let settled = false
    const finish = (result: Omit<WhisperRun, 'stderr' | 'aborted' | 'vad'>) => {
      if (settled) return
      settled = true
      options.signal.removeEventListener('abort', onAbort)
      resolve({ ...result, stderr, aborted, vad })
    }
    const child = spawn(bin, args, {
      env: options.env,
      shell: false,
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    const kill = () => {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL')
      } catch {
        child.kill('SIGKILL')
      }
    }
    function onAbort() {
      aborted = true
      kill()
    }
    options.signal.addEventListener('abort', onAbort, { once: true })
    if (options.signal.aborted) onAbort()
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      for (const match of chunk.matchAll(PROGRESS)) options.onPercent(Math.min(100, Number(match[1])))
      stderr = (stderr + chunk).slice(-STDERR_KEEP)
      // Line by line: a chunk can end halfway through one.
      const lines = (line + chunk).split('\n')
      line = (lines.pop() ?? '').slice(-LINE_KEEP)
      for (const one of lines) {
        const segment = vad.length < VAD_KEEP ? parseVadLine(one) : null
        if (segment) vad.push(segment)
      }
    })
    child.on('error', (error: NodeJS.ErrnoException) =>
      finish({ exitCode: null, signal: null, spawnError: error.code }),
    )
    // Once stopped, its exit is enough: a process it started could still hold the pipe of its messages open.
    child.on('exit', (code, signal) => {
      if (!aborted) return
      kill()
      finish({ exitCode: code, signal })
    })
    child.on('close', (code, signal) => {
      // Whatever it started in its group goes with it.
      kill()
      finish({ exitCode: code, signal })
    })
  })
}

// whisper-cli needs nothing of the server's environment, and must not see its secrets (contract, rule 5). On Linux the
// official package keeps its libraries beside the program.
export function whisperEnv(libDir: string | null): Record<string, string> {
  const env: Record<string, string> = {}
  for (const key of ['PATH', 'HOME', 'LANG', 'TMPDIR']) {
    const value = process.env[key]
    if (value !== undefined) env[key] = value
  }
  if (libDir) env['LD_LIBRARY_PATH'] = libDir
  return env
}
