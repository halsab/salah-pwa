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
