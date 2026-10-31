import { type Logger, STORE_UNAVAILABLE, Secret, type SecretStore, type StoreResult } from '@ytcreator/core'
import { runTool, type ToolOptions } from './run.ts'

const SERVICE = 'YTCreator'

// Secret Service (GNOME Keyring, KWallet) through `secret-tool`. The value goes on stdin, never in argv (R8).
export function createLinuxSecretService(logger: Logger, options: ToolOptions = {}): SecretStore {
  // `read` maps the exit code to the result, or to undefined when the tool failed.
  async function secretTool<T>(
    operation: string,
    args: string[],
    input: string | null,
    read: (exitCode: number, stdout: string) => { value: T } | undefined,
  ): Promise<StoreResult<T>> {
    const { exitCode, stdout } = await runTool('secret-tool', args, input, options)
    const result = exitCode === null ? undefined : read(exitCode, stdout)
    if (result) return { ok: true, value: result.value }
    logger.warn('secrets.secret_service_failed', { operation, exitCode })
    return { ok: false, failure: STORE_UNAVAILABLE }
  }

  const attributes = (ref: string) => ['service', SERVICE, 'account', ref]

  return {
    kind: 'secret-service',
    set: (ref, secret) =>
      secretTool('set', ['store', `--label=${SERVICE}`, ...attributes(ref)], secret.reveal(), (code) =>
        code === 0 ? { value: undefined } : undefined,
      ),
    // `lookup` exits 1 with no output when nothing matches.
    get: (ref) =>
      secretTool('get', ['lookup', ...attributes(ref)], null, (code, stdout) => {
        if (code === 0 && stdout !== '') return { value: Secret.from(stdout) }
        return code === 1 && stdout === '' ? { value: null } : undefined
      }),
    // `clear` exits 0 whether or not something matched.
    delete: (ref) =>
      secretTool('delete', ['clear', ...attributes(ref)], null, (code) =>
        code === 0 ? { value: undefined } : undefined,
      ),
  }
}
