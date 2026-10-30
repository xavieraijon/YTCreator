import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { appPaths, ForeignWorkspaceError, prepareWorkspace } from '../src/paths.ts'

const homes: string[] = []

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

function homePaths() {
  const home = mkdtempSync(join(tmpdir(), 'ytc-paths-'))
  homes.push(home)
  return appPaths({ platform: 'linux', env: {}, homedir: home })
}

describe('appPaths', () => {
  it('uses Application Support on macOS', () => {
    const paths = appPaths({ platform: 'darwin', env: {}, homedir: '/Users/ana' })
    expect(paths.appHome).toBe('/Users/ana/Library/Application Support/YTCreator')
    expect(paths.secrets).toBe('/Users/ana/Library/Application Support/YTCreator/secrets')
    expect(paths.workspace).toBe('/Users/ana/YTCreator')
    expect(paths.database).toBe('/Users/ana/YTCreator/ytcreator.db')
    expect(paths.workspaceMarker).toBe('/Users/ana/YTCreator/.ytcreator')
  })

  it('follows XDG_DATA_HOME on Linux', () => {
    const paths = appPaths({ platform: 'linux', env: { XDG_DATA_HOME: '/data' }, homedir: '/home/ana' })
    expect(paths.appHome).toBe('/data/ytcreator')
    expect(paths.claudeAccounts).toBe('/data/ytcreator/claude-accounts')
  })

  it('falls back to ~/.local/share on Linux', () => {
    const paths = appPaths({ platform: 'linux', env: {}, homedir: '/home/ana' })
    expect(paths.appHome).toBe('/home/ana/.local/share/ytcreator')
    expect(paths).toMatchObject({
      runtime: '/home/ana/.local/share/ytcreator/runtime',
      versions: '/home/ana/.local/share/ytcreator/versions',
      current: '/home/ana/.local/share/ytcreator/current',
      installFile: '/home/ana/.local/share/ytcreator/install.json',
      instanceFile: '/home/ana/.local/share/ytcreator/instance.json',
      logs: '/home/ana/.local/share/ytcreator/logs',
      backups: '/home/ana/.local/share/ytcreator/backups',
    })
  })

  it('ignores a relative XDG_DATA_HOME', () => {
    const paths = appPaths({ platform: 'linux', env: { XDG_DATA_HOME: 'rel' }, homedir: '/home/ana' })
    expect(paths.appHome).toBe('/home/ana/.local/share/ytcreator')
  })

  it('never puts secrets inside the workspace', () => {
    for (const platform of ['darwin', 'linux'] as const) {
      const paths = appPaths({ platform, env: {}, homedir: '/h' })
      expect(paths.secrets.startsWith(paths.workspace + '/')).toBe(false)
    }
  })
})

// Edge case «carpeta que no es de YTCreator»: the server guards it too, not only the installer (T158).
describe('prepareWorkspace', () => {
  it('creates the folder with its mark when it does not exist', () => {
    const paths = homePaths()
    prepareWorkspace(paths)
    expect(existsSync(paths.workspaceMarker)).toBe(true)
  })

  it('takes an empty folder and marks it', () => {
    const paths = homePaths()
    mkdirSync(paths.workspace)
    prepareWorkspace(paths)
    expect(existsSync(paths.workspaceMarker)).toBe(true)
  })

  it('accepts its own folder', () => {
    const paths = homePaths()
    mkdirSync(paths.workspace)
    writeFileSync(paths.workspaceMarker, '')
    writeFileSync(paths.database, '')
    expect(() => prepareWorkspace(paths)).not.toThrow()
  })

  it('refuses a folder with something else inside and leaves it untouched', () => {
    const paths = homePaths()
    mkdirSync(paths.workspace)
    writeFileSync(join(paths.workspace, 'notas.txt'), 'mío')
    expect(() => prepareWorkspace(paths)).toThrow(ForeignWorkspaceError)
    expect(readdirSync(paths.workspace)).toEqual(['notas.txt'])
  })
})
