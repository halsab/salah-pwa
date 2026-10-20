import { choosePlace, expect, expectSchedule, readSavedSetting, test } from './fixtures'

test('Mobile Safari выбирает место и открывает календарь без потери расписания', async ({ page }) => {
  await page.goto('./')
  await choosePlace(page)
  await expectSchedule(page)

  await page.locator('#home-date').click()
  await expect(page.getByRole('region', { name: 'Установка даты' })).toBeVisible()
  await page.getByRole('button', { name: 'Назад', exact: true }).click()
  await expectSchedule(page)
})

test('Mobile Safari сохраняет настройку поста после перезапуска', async ({ page }) => {
  await page.goto('./')
  await choosePlace(page)
  await page.locator('#home-settings').click()

  const fastingMode = page.getByRole('switch')
  await expect(fastingMode).toBeVisible()
  await fastingMode.click()
  await expect(fastingMode).toHaveAttribute('aria-checked', 'true')
  await expect.poll(() => readSavedSetting(page, 'fastingMode')).toMatchObject({ manualEnabled: true })

  await page.reload()
  await expect(page.locator('#home-settings')).toBeVisible()
  await page.locator('#home-settings').click()
  await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('button', { name: 'Назад', exact: true }).click()
  await expect(page.getByRole('progressbar')).toBeVisible()
})
