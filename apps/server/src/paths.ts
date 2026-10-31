import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path/posix'

export interface AppPaths {
  appHome: string
  runtime: string
  versions: string
  current: string
  installFile: string
  instanceFile: string
  secrets: string
  claudeAccounts: string
  logs: string
  backups: string
  workspace: string
  database: string
  workspaceMarker: string
}

export interface PathsInput {
  platform: 'darwin' | 'linux'
  env: Record<string, string | undefined>
  homedir: string
}

// R3: the app's own files live in APP_HOME; the creator's data, in ~/YTCreator, never with secrets.
export function appPaths({ platform, env, homedir }: PathsInput): AppPaths {
  const xdg = env.XDG_DATA_HOME
  const appHome =
    platform === 'darwin'
      ? join(homedir, 'Library', 'Application Support', 'YTCreator')
      : join(xdg?.startsWith('/') ? xdg : join(homedir, '.local', 'share'), 'ytcreator')
  const workspace = join(homedir, 'YTCreator')
  return {
    appHome,
    runtime: join(appHome, 'runtime'),
    versions: join(appHome, 'versions'),
    current: join(appHome, 'current'),
    installFile: join(appHome, 'install.json'),
    instanceFile: join(appHome, 'instance.json'),
    secrets: join(appHome, 'secrets'),
    claudeAccounts: join(appHome, 'claude-accounts'),
    logs: join(appHome, 'logs'),
    backups: join(appHome, 'backups'),
    workspace,
    database: join(workspace, 'ytcreator.db'),
    workspaceMarker: join(workspace, '.ytcreator'),
  }
}

export class ForeignWorkspaceError extends Error {
  readonly workspace: string

  constructor(workspace: string) {
    super(
      'La carpeta YTCreator de tu carpeta personal ya existe y no parece ser de YTCreator. ' +
        'Mueve o renombra esa carpeta y vuelve a abrir YTCreator.',
    )
    this.name = 'ForeignWorkspaceError'
    this.workspace = workspace
  }
}

// The installer already refuses a ~/YTCreator that is not ours (step 2); the server checks it again, because it
// can run where the installer never did (another HOME), and must never write its database into someone's folder.
export function prepareWorkspace(paths: AppPaths): void {
  if (existsSync(paths.workspace) && !existsSync(paths.workspaceMarker) && readdirSync(paths.workspace).length > 0) {
    throw new ForeignWorkspaceError(paths.workspace)
  }
  mkdirSync(paths.workspace, { recursive: true })
  if (!existsSync(paths.workspaceMarker)) writeFileSync(paths.workspaceMarker, '')
}
