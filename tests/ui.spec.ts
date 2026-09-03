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

  test('выравнивает список по строке поиска и закрытия', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /Казань/ }).click()
    await page.getByRole('button', { name: 'Найти город или район' }).click()

    const searchBox = page.getByRole('searchbox')
    await searchBox.fill('Казань')
    const countryTab = page.getByRole('dialog').locator('.official-country-group')
    const [searchBounds, tabBounds] = await Promise.all([
      page.locator('.location-search-header').boundingBox(),
      countryTab.boundingBox(),
    ])
    const inputMetrics = await searchBox.evaluate((element) => {
      const styles = getComputedStyle(element)
      return {
        height: element.getBoundingClientRect().height,
        lineHeight: Number.parseFloat(styles.lineHeight),
        paddingBottom: Number.parseFloat(styles.paddingBottom),
        paddingTop: Number.parseFloat(styles.paddingTop),
      }
    })

    expect(searchBounds).not.toBeNull()
    expect(tabBounds).not.toBeNull()
    expect(Math.abs(inputMetrics.height - inputMetrics.lineHeight)).toBeLessThanOrEqual(1)
    expect(inputMetrics.paddingTop).toBe(0)
    expect(inputMetrics.paddingBottom).toBe(0)
    expect(Math.abs(tabBounds!.x - searchBounds!.x)).toBeLessThanOrEqual(1)
    expect(
      Math.abs(
        tabBounds!.x + tabBounds!.width - (searchBounds!.x + searchBounds!.width),
      ),
    ).toBeLessThanOrEqual(1)
  })

  test('растягивает скролл до краёв экрана и сохраняет отступы контента', async ({ page }) => {
    await page.setViewportSize({ width: 319, height: 1324 })
    await page.goto('./')
    await page.getByRole('button', { name: /Казань/ }).click()

    const getLayout = () => page.locator('.location-results').evaluate((element) => {
      const scrollBounds = element.getBoundingClientRect()
      const contentBounds = element.querySelector('.country-group')!.getBoundingClientRect()
      const styles = getComputedStyle(element)
      return {
        contentLeft: contentBounds.left,
        contentRight: contentBounds.right,
        paddingLeft: Number.parseFloat(styles.paddingLeft),
        scrollLeft: scrollBounds.left,
        scrollRight: scrollBounds.right,
      }
    })

    const browseLayout = await getLayout()
    expect(browseLayout.scrollLeft).toBeLessThanOrEqual(1)
    expect(browseLayout.scrollRight).toBeGreaterThanOrEqual(318)
    expect(browseLayout.paddingLeft).toBeGreaterThanOrEqual(16)
    expect(browseLayout.contentLeft).toBeGreaterThanOrEqual(16)
    expect(browseLayout.contentRight).toBeLessThanOrEqual(303)

    await page.getByRole('button', { name: 'Найти город или район' }).click()
    const searchLayout = await getLayout()
    expect(searchLayout.scrollLeft).toBeLessThanOrEqual(1)
    expect(searchLayout.scrollRight).toBeGreaterThanOrEqual(318)
    expect(searchLayout.paddingLeft).toBeGreaterThanOrEqual(16)
    expect(searchLayout.contentLeft).toBeGreaterThanOrEqual(16)
    expect(searchLayout.contentRight).toBeLessThanOrEqual(303)
  })

  test('оставляет результаты видимыми над клавиатурой', async ({ page }) => {
    await page.addInitScript(() => {
      const viewport = Object.assign(new EventTarget(), {
        height: 852,
        offsetLeft: 0,
        offsetTop: 0,
        pageLeft: 0,
        pageTop: 0,
        scale: 1,
        width: 393,
      })
      Object.defineProperty(window, 'visualViewport', {
        configurable: true,
        value: viewport,
      })
    })
    await page.setViewportSize({ width: 393, height: 852 })
    await page.goto('./')
    await page.getByRole('button', { name: /Казань/ }).click()
    await page.getByRole('button', { name: 'Найти город или район' }).click()
    await page.getByRole('searchbox').fill('Казань')
    await page.evaluate(() => {
      Object.assign(window.visualViewport!, { height: 393 })
      window.visualViewport!.dispatchEvent(new Event('resize'))
    })

    const layer = page.locator('.dialog-layer')
    await expect(layer).toHaveAttribute('data-keyboard-open', 'true')
    await expect(page.locator('.location-attribution')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Определить автоматически' })).toHaveCount(0)

    const result = page.getByRole('dialog').getByRole('button', { name: 'Казань' })
    const [layerBounds, dialogBounds, resultBounds, resultsLayout] = await Promise.all([
      layer.boundingBox(),
      page.getByRole('dialog').boundingBox(),
      result.boundingBox(),
      page.locator('.location-results').evaluate((element) => ({
        clientHeight: element.clientHeight,
        paddingBottom: Number.parseFloat(getComputedStyle(element).paddingBottom),
        scrollHeight: element.scrollHeight,
      })),
    ])

    expect(layerBounds!.height).toBeGreaterThanOrEqual(851)
    expect(Math.abs(dialogBounds!.y + dialogBounds!.height - (layerBounds!.y + layerBounds!.height))).toBeLessThanOrEqual(1)
    expect(dialogBounds!.y + dialogBounds!.height).toBeGreaterThan(800)
    expect(resultsLayout.paddingBottom).toBeGreaterThanOrEqual(459)
    expect(resultsLayout.scrollHeight).toBeGreaterThan(resultsLayout.clientHeight)
    expect(resultBounds).not.toBeNull()
    expect(resultBounds!.y).toBeGreaterThanOrEqual(0)
    expect(resultBounds!.y + resultBounds!.height).toBeLessThanOrEqual(393)
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

  test('показывает крупный QR-код без переполнения на 319 px', async ({ page }) => {
    await page.setViewportSize({ width: 319, height: 812 })
    await page.goto('./')

    const shareButton = page.getByRole('button', { name: 'Поделиться', exact: true })
    expect(await shareButton.evaluate((element) => element.previousElementSibling?.className)).toBe('app-frame')
    await shareButton.click()

    const dialog = page.getByRole('dialog', { name: 'Поделиться Salah' })
    const qr = dialog.getByRole('img', { name: 'QR-код со ссылкой на Salah' })
    await expect(qr).toHaveAttribute('src', '/salah-pwa/share-qr.svg')

    const layout = await dialog.evaluate((element) => {
      const dialogBounds = element.getBoundingClientRect()
      const qrBounds = element.querySelector('.share-qr')!.getBoundingClientRect()
      return {
        dialogLeft: dialogBounds.left,
        dialogRight: dialogBounds.right,
        dialogOverflow: element.scrollHeight - element.clientHeight,
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
        qrWidth: qrBounds.width,
      }
    })

    expect(layout.dialogLeft).toBeGreaterThanOrEqual(0)
    expect(layout.dialogRight).toBeLessThanOrEqual(319)
    expect(layout.dialogOverflow).toBe(0)
    expect(layout.pageOverflow).toBeLessThanOrEqual(0)
    expect(layout.qrWidth).toBeGreaterThanOrEqual(230)

    await dialog.getByRole('button', { name: 'Закрыть' }).click()
    await expect(shareButton).toBeFocused()
  })

  test('оставляет внутренний отступ у текущего намаза на 380 px', async ({ page }) => {
    await page.setViewportSize({ width: 380, height: 1324 })
    await page.goto('./')

    const inset = await page.locator('.next-name').evaluate((element) => {
      const panel = element.closest('.next-prayer-panel')!.getBoundingClientRect()
      return element.getBoundingClientRect().left - panel.left
    })

    expect(inset).toBeGreaterThanOrEqual(14 - 0.1)
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
  test.use({ viewport: { width: 380, height: 1324 }, hasTouch: true, isMobile: true })

  test('открывает клавиатуру только после тапа по поиску', async ({ page }) => {
    await page.goto('./')

    await page.getByRole('button', { name: /Казань/ }).tap()
    await expect(page.getByRole('dialog')).toBeFocused()
    await expect(page.getByRole('searchbox')).toHaveCount(0)

    await page.getByRole('button', { name: 'Найти город или район' }).tap()
    await expect(page.getByRole('searchbox')).toBeFocused()
  })

  test('не оставляет обводку на экшенах после тапа', async ({ page }) => {
    await page.goto('./')

    const locationButton = page.getByRole('button', { name: /Казань/ })
    await locationButton.tap()
    await locationButton.focus()
    await expect(locationButton).toHaveCSS('outline-style', 'none')

    await page.getByRole('dialog').getByRole('button', { name: 'Закрыть' }).tap()
    await page.getByRole('button', { name: 'Настройки автономного расчёта' }).tap()
    const asrSelect = page.getByLabel('Аср', { exact: true })
    await asrSelect.focus()
    await expect(asrSelect).toHaveCSS('outline-style', 'none')
  })
})
