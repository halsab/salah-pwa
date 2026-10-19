import { choosePlace, expectSchedule, readSavedSetting, expect, test } from './fixtures'

test('основной путь: поиск города сохраняет выбор и показывает расписание', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))

  await page.goto('./')
  await choosePlace(page, 'Стамбул', 'Стамбул, Стамбул, Турция')
  await expectSchedule(page, 7)
  await expect(page.getByRole('timer')).toBeVisible()
  await expect(page.locator('#home-location')).toHaveAccessibleName(/^Стамбул(?: \d{2}:\d{2})?$/)
  await expect.poll(() => readSavedSetting(page, 'locationChoice')).toMatchObject({
    place: { name: 'Стамбул, Стамбул, Турция' },
  })
  expect(pageErrors).toEqual([])
})


// Ошибка доставки JS-модуля и восстановление после reload требуют настоящего браузера.
test('failed secondary-screen chunk preserves the usable home and offers recovery', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, serviceWorkers: 'block' })
  const page = await context.newPage()
  try {
    await page.clock.setFixedTime(new Date('2026-09-04T09:30:00.000Z'))
    await page.goto('./')
    await choosePlace(page)
    const times = await page.locator('.event-row time').allTextContents()
    expect(await page.evaluate(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('SecondaryScreens-')))).toBe(false)
    await page.route('**/assets/SecondaryScreens-*.js', route => route.abort())
    await page.locator('#home-settings').click()
    await expect(page.getByRole('alert')).toHaveText(/Не удалось открыть экран/)
    await expect(page.getByRole('timer')).toBeVisible()
    expect(await page.locator('.event-row time').allTextContents()).toEqual(times)
    await page.unroute('**/assets/SecondaryScreens-*.js')
    await page.getByRole('button', { name: 'Повторить', exact: true }).click()
    await expect(page.getByRole('timer')).toBeVisible()
    await page.locator('#home-settings').click()
    await expect(page.getByRole('button', { name: 'Данные и конфиденциальность' })).toBeVisible()
  } finally { await context.close() }
})
