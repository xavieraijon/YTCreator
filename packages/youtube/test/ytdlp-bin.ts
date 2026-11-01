import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const FAKE = join(import.meta.dirname, 'fixtures', 'fake-yt-dlp')

export interface FakeYtDlpState {
  mode?: 'normal' | 'hang' | 'offline'
}

// A `yt-dlp` of its own per test: a wrapper that points fake-yt-dlp at a fresh folder with the mode.
export function createFakeYtDlp(state: FakeYtDlpState = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ytc-fake-ytdlp-'))
  writeFileSync(join(dir, 'state.json'), JSON.stringify(state))
  const bin = join(dir, 'yt-dlp')
  writeFileSync(bin, `#!/bin/sh\nFAKE_YTDLP_DIR='${dir}' exec '${process.execPath}' '${FAKE}' "$@"\n`)
  chmodSync(bin, 0o755)
  const log = join(dir, 'calls.log')

  return {
    bin,
    calls: (): string[][] =>
      (existsSync(log) ? readFileSync(log, 'utf8') : '')
        .split('\n')
        .filter(Boolean)
        .map((line) => (JSON.parse(line) as { argv: string[] }).argv),
  }
}
