import { back, choosePlace, openSchedule, expect, test } from './fixtures'

test('основной путь работает без ошибок во всех браузерных профилях', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('./')
  await choosePlace(page)
  await openSchedule(page)
  await expect(page.getByRole('list', { name: 'Расписание дня' }).getByRole('listitem'))
    .toHaveCount(8)
  await expect(page.getByRole('timer')).toBeVisible()

  await back(page)
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

  await page.getByRole('button', { name: 'Настройки', exact: true }).click()
  await page.getByRole('button', { name: 'Данные и конфиденциальность' }).click()
  await page.getByRole('link', { name: 'Конфиденциальность' }).click()
  await expect(page.getByRole('heading', { name: 'Конфиденциальность' })).toBeVisible()
  expect(pageErrors).toEqual([])
})

test('профиль сохраняет заданную ориентацию без overflow', async ({
  page,
}, testInfo) => {
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
})

test('поиск города в Worker показывает регион и сохраняет выбор', async ({ page }) => {
  await page.goto('./')
  await choosePlace(page)
  await page.getByRole('button', { name: /Казань/ }).click()
  await page.getByRole('button', { name: 'Найти город' }).click()
  await page.getByRole('searchbox').fill('Стамбул')
  const city = page.getByRole('button', { name: 'Стамбул, Стамбул, Турция', exact: true })
  await expect(city).toBeVisible()
  await expect(city).toHaveText(/Стамбул, Турция/)
  await city.click()
  await openSchedule(page, 7)
  await back(page)
  await expect(page.getByRole('button', { name: /Стамбул, Стамбул, Турция/ })).toBeVisible()
})

test('поиск остаётся доступен в уменьшенной видимой области, календарь возвращает фокус', async ({ page }, testInfo) => {
  await page.goto('./')
  await choosePlace(page)
  await page.getByLabel('Выбрать дату').fill('2026-09-01')
  await expect(page.getByRole('listitem')).toHaveCount(8)
  await expect(page.getByRole('timer')).toHaveCount(0)
  await back(page)
  await expect(page.getByLabel('Выбрать дату')).toBeFocused()
  await page.locator('#home-location').click()
  await page.getByRole('button', { name: 'Найти город' }).click()
  await expect(page.getByRole('searchbox')).toBeFocused()
  await page.getByRole('searchbox').fill('Москва')
  await expect(page.getByRole('button', { name: 'Москва, Москва, Россия' })).toBeVisible()
  await page.evaluate(() => {
    const viewport = window.visualViewport
    if (!viewport) throw new Error('Нет visualViewport')
    Object.defineProperties(viewport, { height: { configurable: true, value: 300 }, offsetTop: { configurable: true, value: 30 } })
    viewport.dispatchEvent(new Event('resize'))
  })
  await expect(page.locator('.app-layout')).toHaveCSS('height', '300px')
  const field = await page.getByRole('searchbox').boundingBox()
  const result = await page.getByRole('button', { name: 'Москва, Москва, Россия' }).boundingBox()
  const cancel = await page.getByRole('button', { name: 'Отмена' }).boundingBox()
  if (!field || !result || !cancel) throw new Error('Нет геометрии поиска')
  expect(field.x).toBe(cancel.x)
  expect(result.x).toBe(cancel.x)
  expect(result.y + result.height).toBeLessThanOrEqual(330)
  await page.screenshot({ path: `/tmp/salah-final-keyboard-${testInfo.project.name}.png` })
})
