import { spawn } from 'node:child_process'
import type { Logger } from '@ytcreator/core'
import type { RepairState } from '@ytcreator/core/api'

// Runs the installer and resolves with its exit code; it never rejects.
export type InstallerRunner = () => Promise<number>

export interface ClaudeRepairDeps {
  run: InstallerRunner
  logger: Logger
  // Called after the installer ends, so `claude --version` is asked again. The run stays `en_curso` until it
  // settles, so whoever polls sees the accounts already checked again.
  onFinished?: (exitCode: number) => void | Promise<void>
}

// The official installer (research R5): it leaves `claude` in ~/.local/bin without sudo. Its output is discarded:
// only the exit code is logged.
export function officialInstaller(env: Record<string, string | undefined>): InstallerRunner {
  const url = env.YTCREATOR_CLAUDE_INSTALL_URL || 'https://claude.ai/install.sh'
  return () =>
    new Promise((resolve) => {
      const child = spawn('bash', ['-c', 'curl -fsSL "$YTC_INSTALL_URL" | bash'], {
        env: { ...process.env, YTC_INSTALL_URL: url },
        stdio: 'ignore',
      })
      child.once('error', () => resolve(-1))
      child.once('close', (code) => resolve(code ?? -1))
    })
}

// One run at a time: a second start while one is going on joins it.
export function createClaudeRepair({ run, logger, onFinished }: ClaudeRepairDeps) {
  let state: RepairState['state'] = 'inactivo'
  let running: Promise<void> | null = null

  return {
    state: (): RepairState => ({ state }),

    start(): RepairState {
      if (state === 'en_curso') return { state }
      state = 'en_curso'
      logger.info('claude_repair.started', {})
      running = run().then(async (exitCode) => {
        logger.info('claude_repair.finished', { exitCode })
        try {
          await onFinished?.(exitCode)
        } catch {
          // The repair itself is done; a failed recheck only leaves the accounts as they were.
        }
        state = exitCode === 0 ? 'hecho' : 'fallido'
      })
      return { state }
    },

    // For tests: waits for the current run, if any.
    settled: (): Promise<void> => running ?? Promise.resolve(),
  }
}

export type ClaudeRepair = ReturnType<typeof createClaudeRepair>
