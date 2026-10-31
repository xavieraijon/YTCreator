import { type Logger, STORE_UNAVAILABLE, Secret, type SecretStore, type StoreResult } from '@ytcreator/core'
import { runTool, type ToolOptions } from './run.ts'

const SERVICE = 'YTCreator'
// `security` exit code for «The specified item could not be found in the keychain».
const NOT_FOUND = 44

// Inside `security -i` a command line is split like a shell: double quotes keep the value in one word.
function quote(value: string): string {
  return `"${value.replace(/["\\]/g, (c) => `\\${c}`)}"`
}

// macOS keychain through `security`. The value goes in a `security -i` command on stdin, never in argv (R8).
export function createMacosKeychain(logger: Logger, options: ToolOptions = {}): SecretStore {
  // `read` maps the exit code to the result, or to undefined when the tool failed.
  async function security<T>(
    operation: string,
    args: string[],
    input: string | null,
    read: (exitCode: number, stdout: string) => { value: T } | undefined,
  ): Promise<StoreResult<T>> {
    const { exitCode, stdout } = await runTool('security', args, input, options)
    const result = exitCode === null ? undefined : read(exitCode, stdout)
    if (result) return { ok: true, value: result.value }
    logger.warn('secrets.keychain_failed', { operation, exitCode })
    return { ok: false, failure: STORE_UNAVAILABLE }
  }

  return {
    kind: 'keychain',
    set: (ref, secret) =>
      security(
        'set',
        ['-i'],
        `add-generic-password -U -s ${SERVICE} -a ${quote(ref)} -w ${quote(secret.reveal())}\n`,
        (code) => (code === 0 ? { value: undefined } : undefined),
      ),
    get: (ref) =>
      security('get', ['find-generic-password', '-s', SERVICE, '-a', ref, '-w'], null, (code, stdout) => {
        if (code === NOT_FOUND) return { value: null }
        return code === 0 ? { value: Secret.from(stdout) } : undefined
      }),
    delete: (ref) =>
      security('delete', ['delete-generic-password', '-s', SERVICE, '-a', ref], null, (code) =>
        code === 0 || code === NOT_FOUND ? { value: undefined } : undefined,
      ),
  }
}
