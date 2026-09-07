import { expect, test } from './fixtures'

test('основной путь работает без ошибок во всех браузерных профилях', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Salah' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Расписание дня' }).getByRole('listitem'))
    .toHaveCount(8)
  await expect(page.getByRole('timer')).toBeVisible()

  const locationButton = page.getByRole('button', { name: /Казань/ })
  const locationBounds = await locationButton.boundingBox()
  expect(locationBounds?.width).toBeGreaterThanOrEqual(44)
  expect(locationBounds?.height).toBeGreaterThanOrEqual(44)
  await locationButton.click()
  const dialog = page.getByRole('dialog', { name: 'Выбор местоположения' })
  await expect(dialog).toBeVisible()
  await expect(page.locator('.app-background')).toHaveAttribute('inert', '')
  await dialog.getByRole('button', { name: 'Закрыть' }).click()
  await expect(locationButton).toBeFocused()

  await page.getByRole('button', { name: 'Настройки', exact: true }).click()
  await page.getByRole('link', { name: 'Конфиденциальность' }).click()
  await expect(page.getByRole('heading', { name: 'Конфиденциальность' })).toBeVisible()
  expect(pageErrors).toEqual([])
})

test('mobile Safari profiles сохраняют заданную ориентацию без overflow', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile-safari'), 'Проверка mobile-профилей')
  await page.goto('./')

  const viewport = page.viewportSize()
  if (!viewport) throw new Error('Не найден viewport')
  if (testInfo.project.name.endsWith('landscape')) {
    expect(viewport.width).toBeGreaterThan(viewport.height)
  } else {
    expect(viewport.height).toBeGreaterThan(viewport.width)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(1)
})

test('поиск города в Worker показывает регион и сохраняет выбор', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /Казань/ }).click()
  await page.getByRole('button', { name: 'Найти город или район' }).click()
  await page.getByRole('searchbox').fill('Стамбул')
  const city = page.getByRole('button', { name: 'Стамбул, Стамбул, Турция', exact: true })
  await expect(city).toBeVisible()
  await expect(city).toHaveText(/Стамбул, Турция/)
  await city.click()
  await expect(page.getByRole('list', { name: 'Расписание дня' }).getByRole('listitem')).toHaveCount(7)
  await expect(page.getByRole('button', { name: /Стамбул, Стамбул, Турция/ })).toBeVisible()
})
