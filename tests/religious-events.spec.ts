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

test('DateScreen открывает локальный список на 12 месяцев с вложенной навигацией', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-01-01T09:00:00.000Z'))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await choosePlace(page)
  await page.locator('#home-date').click()
  const dateScreen = page.getByRole('region', { name: 'Установка даты' })
  await dateScreen.getByRole('button', { name: 'Праздники и события' }).click()

  const listScreen = page.getByRole('region', { name: 'Праздники и события' })
  await expect(listScreen).toBeVisible()
  const rows = listScreen.locator('button.religious-event-list-row')
  const ids = await rows.evaluateAll(elements => elements.map(element => element.id))
  expect(ids).toEqual([...ids].sort())
  await expect(listScreen.getByText('Начало Рамадана', { exact: true })).toBeVisible()
  await expect(listScreen.getByText('Начало Зуль-хиджи', { exact: true })).toBeVisible()
  await expect(listScreen.getByText('Дни ташрика', { exact: true })).toHaveCount(0)
  await expect(listScreen.getByText('2–3 февраля 2026 · 15 шаабан 1447', { exact: true })).toBeVisible()

  await page.setViewportSize({ width: 320, height: 700 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)

  const ramadanRow = listScreen.getByRole('button', { name: /Начало Рамадана/ })
  await ramadanRow.click()
  const article = page.getByRole('region', { name: 'Рамадан' })
  await expect(article.getByRole('heading', { level: 1 })).toHaveText('Рамадан')
  await article.getByRole('button', { name: 'Назад' }).click()
  await expect(listScreen.getByRole('button', { name: /Начало Рамадана/ })).toBeFocused()
  await listScreen.getByRole('button', { name: 'Назад' }).click()
  await expect(dateScreen.getByRole('button', { name: 'Праздники и события' })).toBeFocused()

  await dateScreen.getByRole('button', { name: 'Праздники и события' }).click()
  await listScreen.getByRole('button', { name: /Начало Рамадана/ }).click()
  await page.goBack()
  await expect(listScreen.getByRole('button', { name: /Начало Рамадана/ })).toBeFocused()
  await page.goForward()
  await expect(page.getByRole('region', { name: 'Рамадан' })).toBeVisible()
})
