import type { LinkState } from '@ytcreator/core'
import { FAKE_LINKS } from './outputs.ts'

// Tests and e2e never reach the internet: the addresses of the fake provider answer from here.
export function createFakeLinkCheck() {
  const STATES = new Map<string, LinkState>([
    [FAKE_LINKS.broken, 'no_abre'],
    [FAKE_LINKS.blocked, 'sin_comprobar'],
  ])
  const check = async (url: string): Promise<LinkState> => STATES.get(url) ?? 'abre'
  return {
    check,
    async checkAll(urls: readonly string[]) {
      return new Map(await Promise.all(urls.map(async (url) => [url, await check(url)] as const)))
    },
  }
}
