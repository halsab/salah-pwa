import { expect, test } from '@playwright/test'

test('two tabs share one execution owner and explicitly hand it off', async ({ context }) => {
  const first = await context.newPage()
  const second = await context.newPage()
  await Promise.all([first.goto('/'), second.goto('/')])

  await expect.poll(async () => (await Promise.all([first, second].map(page => page.locator('.app-layout').count())))
    .reduce((sum, count) => sum + count, 0)).toBe(1)

  const owner = (await first.locator('.app-layout').count()) ? first : second
  const requester = owner === first ? second : first
  await expect(requester.getByRole('heading', { name: 'Приложение уже открыто' })).toBeVisible()
  await requester.getByRole('button', { name: 'Продолжить здесь' }).click()
  await expect(requester.locator('.app-layout')).toBeVisible()
  await expect(owner.getByRole('heading', { name: 'Приложение уже открыто' })).toBeVisible()
  await expect(owner.locator('.app-layout')).toHaveCount(0)
  await requester.context().setOffline(true)
  await owner.getByRole('button', { name: 'Продолжить здесь' }).click()
  await expect(owner.locator('.app-layout')).toBeVisible()
  await expect(requester.getByRole('heading', { name: 'Приложение уже открыто' })).toBeVisible()
  await requester.context().setOffline(false)
})

test('a blocked tab can acquire ownership after the owner closes', async ({ context }) => {
  const owner = await context.newPage()
  const requester = await context.newPage()
  await owner.goto('/')
  await expect(owner.locator('.app-layout')).toBeVisible()
  await requester.goto('/')
  await expect(requester.getByRole('heading', { name: 'Приложение уже открыто' })).toBeVisible()
  await owner.close()
  await requester.getByRole('button', { name: 'Продолжить здесь' }).click()
  await expect(requester.locator('.app-layout')).toBeVisible()
})

test('a full reload releases the prior page lifecycle lock and starts only one App', async ({ context }) => {
  const owner = await context.newPage()
  const requester = await context.newPage()
  await owner.goto('/')
  await expect(owner.locator('.app-layout')).toBeVisible()
  await requester.goto('/')
  await expect(requester.getByRole('heading', { name: 'Приложение уже открыто' })).toBeVisible()

  await owner.reload()
  await expect.poll(async () => (await Promise.all([owner, requester].map(page => page.locator('.app-layout').count())))
    .reduce((sum, count) => sum + count, 0)).toBe(1)
  await expect(requester.locator('.app-layout')).toHaveCount(0)
})

test('simultaneous takeover requests never authorize two apps', async ({ context }) => {
  const pages = await Promise.all([context.newPage(), context.newPage(), context.newPage()])
  await Promise.all(pages.map(page => page.goto('/')))
  await expect.poll(async () => (await Promise.all(pages.map(page => page.locator('.app-layout').count())))
    .reduce((sum, count) => sum + count, 0)).toBe(1)

  const counts = await Promise.all(pages.map(page => page.locator('.app-layout').count()))
  const ownerIndex = counts.findIndex(count => count === 1)
  const requesters = pages.filter((_, index) => index !== ownerIndex)
  await Promise.all(requesters.map(page => page.getByRole('button', { name: 'Продолжить здесь' }).click()))

  await expect.poll(async () => (await Promise.all(pages.map(page => page.locator('.app-layout').count())))
    .reduce((sum, count) => sum + count, 0)).toBe(1)
  await expect.poll(async () => (await Promise.all(pages.map(page => page.locator('.app-layout').count())))
    .filter(count => count === 1)).toHaveLength(1)
})

test('the blocked gate applies seasonal dark tokens without mounting the App', async ({ context }) => {
  const owner = await context.newPage()
  await owner.goto('/')
  await expect(owner.locator('.app-layout')).toBeVisible()

  const blocked = await context.newPage()
  await blocked.emulateMedia({ colorScheme: 'dark' })
  await blocked.addInitScript(() => localStorage.setItem('salah-theme-preference-v1',
    JSON.stringify({ version: 1, themeFamily: 'seasonal' })))
  await blocked.goto('/')

  await expect(blocked.getByRole('heading', { name: 'Приложение уже открыто' })).toBeVisible()
  await expect.poll(() => blocked.evaluate(() => document.documentElement.dataset.theme)).toBe('seasonal')
  await expect.poll(() => blocked.evaluate(() => document.documentElement.dataset.themeTone)).toBe('dark')
  const palette = await blocked.evaluate(() => {
    const gate = document.querySelector('.execution-gate')
    return { season: document.documentElement.dataset.season, color: gate ? getComputedStyle(gate).color : null }
  })
  const seasonalDarkText = {
    winter: 'rgb(241, 244, 246)', spring: 'rgb(241, 245, 241)',
    summer: 'rgb(244, 242, 233)', autumn: 'rgb(245, 239, 234)',
  }
  expect(palette.color).toBe(seasonalDarkText[palette.season as keyof typeof seasonalDarkText])
  await expect(blocked.locator('.app-layout')).toHaveCount(0)
})

test('classic light blocked styling reads cached state without mutating it', async ({ context }) => {
  const owner = await context.newPage()
  await owner.goto('/')
  await expect(owner.locator('.app-layout')).toBeVisible()

  const blocked = await context.newPage()
  await blocked.emulateMedia({ colorScheme: 'light' })
  await blocked.addInitScript(() => localStorage.setItem('salah-theme-preference-v1', '{'))
  await blocked.goto('/')

  await expect(blocked.getByRole('heading', { name: 'Приложение уже открыто' })).toBeVisible()
  await expect.poll(() => blocked.evaluate(() => document.documentElement.dataset.theme)).toBe('classic')
  await expect.poll(() => blocked.evaluate(() => document.documentElement.dataset.themeTone)).toBe('light')
  await expect(blocked.locator('.execution-gate')).toHaveCSS('color', 'rgb(24, 24, 24)')
  await expect.poll(() => blocked.evaluate(() => localStorage.getItem('salah-theme-preference-v1'))).toBe('{')
})
