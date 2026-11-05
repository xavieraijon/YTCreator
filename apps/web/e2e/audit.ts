import AxeBuilder from '@axe-core/playwright'
import { expect, type Locator, type Page } from '@playwright/test'

// What every screen has to pass (SC-010 of the 002, principle IX): shared by a11y.spec.ts and the journeys that reach screens
// the wizard does not.
const tags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']

// 200 % zoom on a 1280 × 800 window leaves a 640 × 400 CSS viewport.
const sizes = [
  { name: 'escritorio', width: 1280, height: 800 },
  { name: '375 px', width: 375, height: 800 },
  { name: 'zoom 200 %', width: 640, height: 400 },
] as const

// Each screen in each theme and size: axe, and no horizontal scroll (reflow, WCAG 1.4.10). Collected, not thrown, so
// one run lists them all.
export function auditor(page: Page, { onlyWcag = true } = {}) {
  const failures: string[] = []
  const audit = async (screen: string) => {
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
      for (const size of sizes) {
        await page.setViewportSize(size)
        // The colours of a control just clicked or of the theme just switched are measured once settled.
        await page.evaluate(async () => {
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
          // A loop never ends, like the bar of something still working: only those that end are waited for.
          const ending = document
            .getAnimations()
            .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
          const settled = Promise.all(ending.map((animation) => animation.finished.catch(() => undefined)))
          // An animation paused or waiting on a hidden element would never end either.
          await Promise.race([settled, new Promise((resolve) => setTimeout(resolve, 2_000))])
        })
        const where = `${screen} · ${colorScheme} · ${size.name}`
        // With reduced motion nothing may keep moving (principle VI).
        const moving = await page.evaluate(() =>
          document
            .getAnimations()
            .filter((animation) => animation.playState === 'running')
            .map((animation) => {
              const timing = animation.effect?.getComputedTiming()
              return {
                name: animation instanceof CSSAnimation ? animation.animationName : 'transición',
                ms: timing?.duration,
              }
            })
            .filter(({ ms }) => typeof ms === 'number' && ms > 50)
            .map(({ name }) => name),
        )
        if (moving.length > 0) failures.push(`${where}: movimiento con prefers-reduced-motion (${moving.join(', ')})`)
        const builder = new AxeBuilder({ page })
        const { violations } = await (onlyWcag ? builder.withTags(tags) : builder).analyze()
        for (const violation of violations) {
          failures.push(
            `${where}: ${violation.id} (${violation.nodes.map((node) => node.target.join(' ')).join(', ')})`,
          )
        }
        if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) {
          failures.push(`${where}: desplazamiento horizontal`)
        }
      }
    }
    await page.setViewportSize(sizes[0])
  }
  return { failures, audit }
}

// Tabs up to the control and checks the focus can be seen.
export async function tabTo(page: Page, target: Locator) {
  for (let tabs = 0; tabs < 40; tabs++) {
    if (await target.evaluate((element) => element === document.activeElement)) break
    await page.keyboard.press('Tab')
  }
  await expect(target).toBeFocused()
  const ring = await target.evaluate((element) => {
    if (!element.matches(':focus-visible')) return false
    for (let node: Element | null = element, up = 0; node && up < 3; node = node.parentElement, up++) {
      const style = getComputedStyle(node)
      if (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) return true
    }
    return false
  })
  expect(ring, 'foco visible').toBe(true)
}
