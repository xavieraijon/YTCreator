import { describe, expect, it } from 'vitest'
import { appPaths } from '../src/paths.ts'

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
