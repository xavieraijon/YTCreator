import { describe, expect, it } from 'vitest'
import { compareVersions, isNewer } from '../../src/updates/version.ts'

describe('compareVersions', () => {
  it('orders by major, minor and patch', () => {
    expect(compareVersions('1.2.3', '1.2.4')).toBe(-1)
    expect(compareVersions('1.3.0', '1.2.9')).toBe(1)
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1)
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
  })

  it('tolerates a leading v', () => {
    expect(compareVersions('v1.2.3', '1.2.3')).toBe(0)
    expect(compareVersions('v1.2.4', '1.2.3')).toBe(1)
  })

  it('ranks a prerelease below its release (SemVer §11)', () => {
    expect(compareVersions('1.2.3-beta.1', '1.2.3')).toBe(-1)
    expect(compareVersions('1.2.3', '1.2.3-beta.1')).toBe(1)
  })

  it('orders prereleases between themselves', () => {
    expect(compareVersions('1.2.3-alpha', '1.2.3-beta')).toBe(-1)
    expect(compareVersions('1.2.3-beta.2', '1.2.3-beta.11')).toBe(-1)
    expect(compareVersions('1.2.3-beta', '1.2.3-beta')).toBe(0)
  })

  it('throws on something that is not a version', () => {
    expect(() => compareVersions('not-a-version', '1.0.0')).toThrow()
  })
})

describe('isNewer', () => {
  it('is true only when the candidate is strictly above the current version', () => {
    expect(isNewer('1.2.4', '1.2.3')).toBe(true)
    expect(isNewer('1.2.3', '1.2.3')).toBe(false)
    expect(isNewer('1.2.2', '1.2.3')).toBe(false)
  })

  it('a prerelease of the current version is never newer', () => {
    expect(isNewer('1.2.3-beta.1', '1.2.3')).toBe(false)
  })
})
