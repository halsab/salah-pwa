import { choosePlace, expect, expectSchedule, test } from './fixtures'

test('mobile header keeps the full Hijri date beside a long city at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto('./')
  await choosePlace(page)
  await expectSchedule(page)

  await page.locator('#home-location').click()
  await page.getByRole('button', { name: 'Найти город', exact: true }).click()
  await page.getByRole('searchbox').fill('Дехивала-Маунт-Лавиния')
  await page.getByRole('button', { name: /Дехивала-Маунт-Лавиния/ }).click()
  await expect(page.getByRole('region', { name: 'Главная', exact: true })).toBeVisible()

  await page.locator('#home-date').click()
  await page.getByRole('combobox', { name: 'Календарь' }).selectOption('hijri')
  await page.getByRole('combobox', { name: 'Месяц' }).selectOption('6')
  await page.getByRole('combobox', { name: 'День' }).selectOption('12')
  await page.getByRole('button', { name: 'Назад', exact: true }).click()

  const location = page.locator('#home-location')
  const date = page.locator('#home-date')
  await expect(location).toContainText('Дехивала-Маунт-Лавиния')
  await expect(date.locator('time')).toHaveText('12 джум. ах.')
  await expect(page.locator('#home-date-description')).toHaveText(/^12 джумада аль-ахира \d{4}$/)
  await expect(date).toHaveAttribute('aria-describedby', 'home-date-description')

  const layout = await page.evaluate(() => {
    const locationButton = document.querySelector<HTMLElement>('#home-location')
    const dateButton = document.querySelector<HTMLElement>('#home-date')
    const dateText = document.querySelector<HTMLElement>('#home-date time')
    const header = document.querySelector<HTMLElement>('.screen-top')
    if (!locationButton || !dateButton || !dateText || !header) throw new Error('Не найдены элементы заголовка')
    const range = document.createRange()
    range.selectNodeContents(dateText)
    const text = range.getBoundingClientRect()
    return {
      documentWidth: document.documentElement.scrollWidth,
      locationRight: locationButton.getBoundingClientRect().right,
      dateLeft: dateButton.getBoundingClientRect().left,
      dateRight: dateButton.getBoundingClientRect().right,
      dateTextRight: text.right,
      dateHeight: dateButton.getBoundingClientRect().height,
      headerHeight: header.getBoundingClientRect().height,
    }
  })
  expect(layout.documentWidth).toBeLessThanOrEqual(320)
  expect(layout.dateLeft).toBeGreaterThanOrEqual(layout.locationRight)
  expect(layout.dateTextRight).toBeLessThanOrEqual(layout.dateRight)
  expect(layout.dateRight).toBeLessThanOrEqual(320)
  expect(layout.dateHeight).toBe(44)
  expect(layout.headerHeight).toBe(44)
})
