import { expect, test } from '@playwright/test'

test.describe('мобильная компоновка', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test('показывает таймер и минимум четыре времени без прокрутки', async ({ page }) => {
    await page.goto('./')

    const schedule = page.getByRole('list', { name: 'Времена намаза' })
    const rows = schedule.getByRole('listitem')
    await expect(rows).toHaveCount(8)
    await expect(page.getByRole('timer')).toBeVisible()

    const visibleRows = await rows.evaluateAll((elements) =>
      elements.filter((element) => element.getBoundingClientRect().bottom <= window.innerHeight)
        .length,
    )
    const firstRowTop = await rows.first().evaluate(
      (element) => element.getBoundingClientRect().top,
    )

    expect(visibleRows).toBeGreaterThanOrEqual(4)
    expect(firstRowTop).toBeLessThanOrEqual(380)
  })

  test('оставляет возврат к сегодняшней дате в строке навигации', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: 'Следующий день' }).click()

    const [dateBounds, todayBounds] = await Promise.all([
      page.locator('.date-picker').boundingBox(),
      page.getByRole('button', { name: 'Сегодня' }).boundingBox(),
    ])

    expect(dateBounds).not.toBeNull()
    expect(todayBounds).not.toBeNull()
    expect(Math.abs(todayBounds!.y - dateBounds!.y)).toBeLessThanOrEqual(1)
  })

  test('выравнивает список населённых пунктов по полю поиска', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /Казань/ }).click()

    const searchBox = page.getByRole('searchbox')
    await searchBox.fill('Казань')
    const firstOption = page.getByRole('dialog').getByRole('button', { name: 'Казань' })
    const [searchBounds, optionBounds] = await Promise.all([
      searchBox.locator('..').boundingBox(),
      firstOption.boundingBox(),
    ])

    expect(searchBounds).not.toBeNull()
    expect(optionBounds).not.toBeNull()
    expect(Math.abs(optionBounds!.x - searchBounds!.x)).toBeLessThanOrEqual(1)
    expect(
      Math.abs(
        optionBounds!.x + optionBounds!.width - (searchBounds!.x + searchBounds!.width),
      ),
    ).toBeLessThanOrEqual(12)
  })

  test('не выпускает клавиатурный фокус из диалога', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /Казань/ }).click()

    const dialog = page.getByRole('dialog')
    const closeButton = dialog.getByRole('button', { name: 'Закрыть' })
    const lastOption = dialog.locator('.country-group summary').last()
    await closeButton.focus()
    await page.keyboard.press('Shift+Tab')
    await expect(lastOption).toBeFocused()

    await page.keyboard.press('Tab')
    await expect(closeButton).toBeFocused()
  })
})
