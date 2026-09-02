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
    const countryTab = page.getByRole('dialog').locator('.official-country-group')
    const [searchBounds, tabBounds] = await Promise.all([
      searchBox.locator('..').boundingBox(),
      countryTab.boundingBox(),
    ])

    expect(searchBounds).not.toBeNull()
    expect(tabBounds).not.toBeNull()
    expect(Math.abs(tabBounds!.x - searchBounds!.x)).toBeLessThanOrEqual(1)
    expect(
      Math.abs(
        tabBounds!.x + tabBounds!.width - (searchBounds!.x + searchBounds!.width),
      ),
    ).toBeLessThanOrEqual(1)
  })

  test('вписывает bottom sheet в доступную область над клавиатурой', async ({ page }) => {
    await page.addInitScript(() => {
      const viewport = Object.assign(new EventTarget(), {
        height: 360,
        offsetLeft: 0,
        offsetTop: 0,
        pageLeft: 0,
        pageTop: 0,
        scale: 1,
        width: 375,
      })
      Object.defineProperty(window, 'visualViewport', {
        configurable: true,
        value: viewport,
      })
    })
    await page.goto('./')
    await page.getByRole('button', { name: /Казань/ }).click()

    const [layerBounds, dialogBounds] = await Promise.all([
      page.locator('.dialog-layer').boundingBox(),
      page.getByRole('dialog').boundingBox(),
    ])

    expect(layerBounds?.height).toBeLessThanOrEqual(361)
    expect(dialogBounds!.y + dialogBounds!.height).toBeLessThanOrEqual(361)
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

test.describe('адаптивность', () => {
  test('вмещает текущий намаз и таймер в две колонки на 988 px', async ({ page }) => {
    await page.setViewportSize({ width: 988, height: 1324 })
    await page.goto('./')

    const currentFitsOneLine = await page.locator('.next-name').evaluate((element) => {
      const styles = getComputedStyle(element)
      return element.getBoundingClientRect().height <= Number.parseFloat(styles.lineHeight) * 1.2
    })
    const countdownFitsContainer = await page.locator('.countdown').evaluate((element) => {
      const container = element.getBoundingClientRect()
      const value = element.querySelector('.countdown-value')!.getBoundingClientRect()
      return value.left >= container.left && value.right <= container.right
    })

    expect(currentFitsOneLine).toBe(true)
    expect(countdownFitsContainer).toBe(true)
  })

  test('не создаёт горизонтальное переполнение на экране 319 px', async ({ page }) => {
    await page.setViewportSize({ width: 319, height: 1324 })
    await page.goto('./')

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)

    for (const selector of ['.app-frame', '.next-prayer-panel', '.countdown', '.prayer-row']) {
      const boxes = await page.locator(selector).evaluateAll((elements) =>
        elements.map((element) => {
          const bounds = element.getBoundingClientRect()
          return { left: bounds.left, right: bounds.right }
        }),
      )
      expect(boxes.every(({ left, right }) => left >= 0 && right <= 319)).toBe(true)
    }

    const longRow = page.getByRole('listitem').filter({ hasText: 'Утренний намаз' })
    await expect(longRow.locator('.prayer-dots')).toHaveCSS('width', /(?:2[2-9]|[3-9]\d|\d{3,})px/)
  })

  test('оставляет внутренний отступ у текущего намаза на 380 px', async ({ page }) => {
    await page.setViewportSize({ width: 380, height: 1324 })
    await page.goto('./')

    const inset = await page.locator('.next-name').evaluate((element) => {
      const panel = element.closest('.next-prayer-panel')!.getBoundingClientRect()
      return element.getBoundingClientRect().left - panel.left
    })

    expect(inset).toBeGreaterThanOrEqual(14)
  })

  test('открывает нативный календарь по клику на дату', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(HTMLInputElement.prototype, 'showPicker', {
        configurable: true,
        value() {
          document.documentElement.dataset.datePickerOpened = 'true'
        },
      })
    })
    await page.goto('./')

    await page.getByLabel('Выбрать дату').click()

    await expect(page.locator('html')).toHaveAttribute('data-date-picker-opened', 'true')
  })
})

test.describe('сенсорное управление', () => {
  test.use({ viewport: { width: 380, height: 1324 }, hasTouch: true })

  test('не оставляет обводку на экшенах после тапа', async ({ page }) => {
    await page.goto('./')

    const locationButton = page.getByRole('button', { name: /Казань/ })
    await locationButton.tap()
    await locationButton.focus()
    await expect(locationButton).toHaveCSS('outline-style', 'none')

    await page.getByRole('dialog').getByRole('button', { name: 'Закрыть' }).tap()
    await page.getByRole('button', { name: 'Настройки автономного расчёта' }).tap()
    const asrSelect = page.getByLabel('Аср')
    await asrSelect.focus()
    await expect(asrSelect).toHaveCSS('outline-style', 'none')
  })
})
