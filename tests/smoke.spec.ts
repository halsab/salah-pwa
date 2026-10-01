import { choosePlace, expectSchedule, readSavedSetting, expect, test } from './fixtures'

test('основной путь: место, расписание, локация и настройки без ошибок', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('./')
  await choosePlace(page)
  await expectSchedule(page)
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

  await page.getByRole('button', { name: 'Настройки', exact: true }).click()
  await page.getByRole('button', { name: 'Данные и конфиденциальность' }).click()
  await expect(page.getByRole('heading', { name: 'Конфиденциальность' })).toBeVisible()
  expect(pageErrors).toEqual([])
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
  await expectSchedule(page, 7)
  await expect(page.locator('#home-location')).toHaveAccessibleName(/^Стамбул(?: \d{2}:\d{2})?$/)
  await expect.poll(() => readSavedSetting(page, 'locationChoice')).toMatchObject({
    place: { name: 'Стамбул, Стамбул, Турция' },
  })
})
