// External pages the screens point to; always opened in another tab.
export const links = {
  claudePlans: 'https://claude.ai/pricing',
  anthropicConsole: 'https://console.anthropic.com',
  anthropicKeys: 'https://console.anthropic.com/settings/keys',
  anthropicBilling: 'https://console.anthropic.com/settings/billing',
} as const

export function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer')
}

// A tab opened on the click itself (or the browser blocks it) that gets its address once the server has one.
export function openPendingTab() {
  const tab = window.open('about:blank', '_blank')
  return {
    go(url: string) {
      if (!tab) return
      tab.opener = null
      tab.location.href = url
    },
    close: () => tab?.close(),
  }
}
