// Minimal SemVer comparison (FR-031, R20): enough to order release tags, not a full SemVer parser.
const PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-.]+))?$/

interface Parsed {
  major: number
  minor: number
  patch: number
  prerelease: string[] | null
}

function parse(version: string): Parsed {
  const match = PATTERN.exec(version)
  if (!match) throw new Error(`Not a version: ${version}`)
  const [, major, minor, patch, prerelease] = match
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease: prerelease ? prerelease.split('.') : null,
  }
}

function compareIdentifier(a: string, b: string): -1 | 0 | 1 {
  const numeric = /^\d+$/
  if (numeric.test(a) && numeric.test(b)) {
    const [numA, numB] = [Number(a), Number(b)]
    return numA === numB ? 0 : numA < numB ? -1 : 1
  }
  if (numeric.test(a)) return -1 // a numeric identifier always sorts before an alphanumeric one (SemVer §11.4.3)
  if (numeric.test(b)) return 1
  return a === b ? 0 : a < b ? -1 : 1
}

function comparePrerelease(a: string[] | null, b: string[] | null): -1 | 0 | 1 {
  if (a === null && b === null) return 0
  if (a === null) return 1 // a release always outranks any of its prereleases (SemVer §11.3)
  if (b === null) return -1
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const [ai, bi] = [a[i], b[i]]
    if (ai === undefined) return -1
    if (bi === undefined) return 1
    const cmp = compareIdentifier(ai, bi)
    if (cmp !== 0) return cmp
  }
  return 0
}

// -1 when `a` < `b`, 0 when equal, 1 when `a` > `b`.
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parse(a)
  const pb = parse(b)
  for (const field of ['major', 'minor', 'patch'] as const) {
    if (pa[field] !== pb[field]) return pa[field] < pb[field] ? -1 : 1
  }
  return comparePrerelease(pa.prerelease, pb.prerelease)
}

export function isNewer(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0
}
