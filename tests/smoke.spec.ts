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
