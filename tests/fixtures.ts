import { expect, test as base } from '@playwright/test'

export const FIXED_BROWSER_TIME = new Date('2026-09-04T09:30:00.000Z')

export const test = base.extend<{ deterministicClock: true }>({
  deterministicClock: [async ({ page }, use) => {
    await page.clock.setFixedTime(FIXED_BROWSER_TIME)
    await use(true)
  }, { auto: true }],
})

export { expect }
