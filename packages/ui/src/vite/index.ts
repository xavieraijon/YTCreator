import type { Plugin } from 'vite'
import { themeInitScript } from '../theme/init-script.ts'

/** Puts the color-scheme meta and the theme init script first in `<head>`, ahead of any stylesheet. */
export function themeInit(): Plugin {
  return {
    name: 'ytcreator:theme-init',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { name: 'color-scheme', content: 'light dark' }, injectTo: 'head-prepend' },
      { tag: 'script', children: themeInitScript, injectTo: 'head-prepend' },
    ],
  }
}
