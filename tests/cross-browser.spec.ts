import { choosePlace, expectSchedule, expect, test } from './fixtures'

// On-demand: запускается через `npm run test:e2e:extended` для browser-specific
// изменений и значимых релизов, а не в обязательном deploy.

test('основной путь работает без ошибок во всех браузерных профилях', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('./')
  await choosePlace(page)
  await expectSchedule(page)
  await expect(page.getByRole('list', { name: 'Расписание дня' }).getByRole('listitem'))
    .toHaveCount(8)
  await expect(page.getByRole('timer')).toBeVisible()

  const locationButton = page.getByRole('button', { name: /Казань/ })
  const locationBounds = await locationButton.boundingBox()
  expect(locationBounds?.width).toBeGreaterThanOrEqual(44)
  expect(locationBounds?.height).toBeGreaterThanOrEqual(44)
  await locationButton.click()
  const dialog = page.getByRole('region', { name: 'Локация' })
  await expect(dialog).toBeVisible()
  await expect(page.locator('.app-screen')).toHaveCount(1)
  await dialog.getByRole('button', { name: 'Назад' }).click()
  await expect(locationButton).toBeFocused()
  expect(pageErrors).toEqual([])
})

test('профиль сохраняет заданную ориентацию без overflow', async ({ page }, testInfo) => {
  await page.goto('./')
  await choosePlace(page)

  const viewport = page.viewportSize()
  if (!viewport) throw new Error('Не найден viewport')
  if (testInfo.project.name.endsWith('landscape')) {
    expect(viewport.width).toBeGreaterThan(viewport.height)
  } else if (testInfo.project.name.endsWith('portrait')) {
    expect(viewport.height).toBeGreaterThan(viewport.width)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(1)
  const panel = await page.locator('.app-screen').boundingBox()
  expect(panel?.x).toBe(0)
  expect(panel?.width).toBe(viewport.width)
})
