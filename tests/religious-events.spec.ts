import { choosePlace, expect, test } from './fixtures'

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-05-23T09:00:00.000Z'))
})

test('баннер, статья, focus и browser snapshot работают на 390 и 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await choosePlace(page)

  const banner = page.locator('#religious-event-banner')
  await expect(banner).toContainText('Первые 10 дней Зуль-хиджи')
  await expect(banner).toContainText('День Арафа через 3 дня')
  await expect(page.locator('.home-content > :first-child')).toHaveAttribute('id', 'religious-event-banner')

  await page.setViewportSize({ width: 320, height: 700 })
  await expect(banner).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)

  await banner.click()
  const article = page.getByRole('region', { name: 'Первые 10 дней Зуль-хиджи' })
  await expect(article.getByRole('heading', { level: 1 })).toHaveText('Первые 10 дней Зуль-хиджи')
  await expect(article.locator('.screen-top button')).toHaveCount(1)
  await expect(article.getByRole('button', { name: 'Назад' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)

  await article.getByRole('button', { name: 'Назад' }).click()
  await expect(banner).toBeFocused()
  await banner.click()
  await page.goBack()
  await expect(banner).toBeFocused()
  await page.goForward()
  await expect(page.getByRole('region', { name: 'Первые 10 дней Зуль-хиджи' })).toBeVisible()
})
