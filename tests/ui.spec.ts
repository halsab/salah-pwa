import type { Locator, Page } from '@playwright/test'

import { expect, test } from './fixtures'

const stageFiveViewports = [
  { label: 'mobile 360×800 portrait', width: 360, height: 800 },
  { label: 'mobile 390×844 portrait', width: 390, height: 844 },
  { label: 'mobile 844×390 landscape', width: 844, height: 390 },
  { label: 'tablet 768×1024 portrait', width: 768, height: 1024 },
  { label: 'tablet 1024×768 landscape', width: 1024, height: 768 },
  { label: 'desktop 1440×900', width: 1440, height: 900 },
] as const

async function waitForAnimations(locator: Locator) {
  await locator.evaluate(async (element) => {
    await Promise.allSettled(element.getAnimations({ subtree: true }).map((animation) => animation.finished))
  })
}

function required<Value>(value: Value | null | undefined, label: string): Value {
  if (value == null) throw new Error(`Не найден ${label}`)
  return value
}

async function expectInsideViewport(locator: Locator, page: Page) {
  await expect(locator).toBeVisible()
  await waitForAnimations(locator)
  const bounds = await locator.boundingBox()
  const viewport = page.viewportSize()
  expect(bounds).not.toBeNull()
  expect(viewport).not.toBeNull()
  const visibleBounds = required(bounds, 'bounds элемента')
  const visibleViewport = required(viewport, 'viewport')
  expect(visibleBounds.x).toBeGreaterThanOrEqual(-1)
  expect(visibleBounds.y).toBeGreaterThanOrEqual(-1)
  expect(visibleBounds.x + visibleBounds.width).toBeLessThanOrEqual(visibleViewport.width + 1)
  expect(visibleBounds.y + visibleBounds.height).toBeLessThanOrEqual(visibleViewport.height + 1)
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
}

async function expectControlTargetsAtLeast44Px(scope: Locator) {
  const undersized = await scope.locator([
    'button:not(:disabled)',
    'input:not(:disabled)',
    'select:not(:disabled)',
    'summary',
  ].join(',')).evaluateAll((elements) => elements.flatMap((element) => {
    const bounds = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    if (
      style.display === 'none'
      || style.visibility === 'hidden'
      || bounds.width === 0
      || bounds.height === 0
    ) return []

    return bounds.width >= 44 && bounds.height >= 44
      ? []
      : [{
          height: Math.round(bounds.height * 10) / 10,
          label: element.getAttribute('aria-label') ?? element.textContent.trim().slice(0, 48),
          tag: element.tagName,
          width: Math.round(bounds.width * 10) / 10,
        }]
  }))

  expect(undersized).toEqual([])
}

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
    expect(Math.abs(
      required(todayBounds, 'bounds кнопки Сегодня').y
      - required(dateBounds, 'bounds даты').y,
    )).toBeLessThanOrEqual(1)
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
    const visibleTabBounds = required(tabBounds, 'bounds группы')
    const visibleSearchBounds = required(searchBounds, 'bounds поиска')
    expect(Math.abs(visibleTabBounds.x - visibleSearchBounds.x)).toBeLessThanOrEqual(1)
    expect(
      Math.abs(
        visibleTabBounds.x + visibleTabBounds.width
        - (visibleSearchBounds.x + visibleSearchBounds.width),
      ),
    ).toBeLessThanOrEqual(1)
  })

  test('растягивает скролл до краёв экрана и сохраняет отступы контента', async ({ page }) => {
    await page.setViewportSize({ width: 319, height: 1324 })
    await page.goto('./')
    await page.getByRole('button', { name: /Казань/ }).click()

    const getLayout = () => page.locator('.location-results').evaluate((element) => {
      const scrollBounds = element.getBoundingClientRect()
      const content = element.querySelector('.country-group')
      if (!content) throw new Error('Не найдена группа стран')
      const contentBounds = content.getBoundingClientRect()
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

  test('растягивает скролл методики до краёв экрана', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 1324 })
    await page.goto('./')
    await page.getByRole('button', { name: 'Методика' }).click()

    const layout = await page.locator('.methodology-content').evaluate((element) => {
      const scrollBounds = element.getBoundingClientRect()
      const content = element.querySelector('.methodology-section')
      if (!content) throw new Error('Не найден раздел методики')
      const contentBounds = content.getBoundingClientRect()
      return {
        contentLeft: contentBounds.left,
        contentRight: contentBounds.right,
        scrollLeft: scrollBounds.left,
        scrollRight: scrollBounds.right,
      }
    })

    expect(layout.scrollLeft).toBeLessThanOrEqual(1)
    expect(layout.scrollRight).toBeGreaterThanOrEqual(419)
    expect(layout.contentLeft).toBeGreaterThanOrEqual(16)
    expect(layout.contentRight).toBeLessThanOrEqual(404)
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
      const viewport = window.visualViewport
      if (!viewport) throw new Error('Не найден visual viewport')
      Object.assign(viewport, { height: 393 })
      viewport.dispatchEvent(new Event('resize'))
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
        paddingBottom: Number.parseFloat(getComputedStyle(element).paddingBottom),
      })),
    ])

    const visibleLayerBounds = required(layerBounds, 'bounds слоя')
    const visibleDialogBounds = required(dialogBounds, 'bounds диалога')
    const visibleResultBounds = required(resultBounds, 'bounds результата')
    expect(visibleLayerBounds.height).toBeGreaterThanOrEqual(851)
    expect(Math.abs(
      visibleDialogBounds.y + visibleDialogBounds.height
      - (visibleLayerBounds.y + visibleLayerBounds.height),
    )).toBeLessThanOrEqual(1)
    expect(visibleDialogBounds.y + visibleDialogBounds.height).toBeGreaterThan(800)
    expect(resultsLayout.paddingBottom).toBeGreaterThanOrEqual(459)
    expect(resultBounds).not.toBeNull()
    expect(visibleResultBounds.y).toBeGreaterThanOrEqual(0)
    expect(visibleResultBounds.y + visibleResultBounds.height).toBeLessThanOrEqual(393)
  })

  test('не выпускает клавиатурный фокус из диалога', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /Казань/ }).click()

    const dialog = page.getByRole('dialog')
    const closeButton = dialog.getByRole('button', { name: 'Закрыть' })
    const lastFocusable = dialog.getByRole('link', { name: 'OpenStreetMap' })
    await closeButton.focus()
    await page.keyboard.press('Shift+Tab')
    await expect(lastFocusable).toBeFocused()

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
      const valueElement = element.querySelector('.countdown-value')
      if (!valueElement) throw new Error('Не найден таймер')
      const value = valueElement.getBoundingClientRect()
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
    const [shareButtonWidth, appFrameWidth] = await Promise.all([
      shareButton.evaluate((element) => Number.parseFloat(getComputedStyle(element).width)),
      page.locator('.app-frame').evaluate((element) => Number.parseFloat(getComputedStyle(element).width)),
    ])
    expect(await shareButton.evaluate((element) => element.previousElementSibling?.className)).toBe('app-frame')
    expect(Math.abs(shareButtonWidth - appFrameWidth)).toBeLessThanOrEqual(1)
    await shareButton.click()

    const dialog = page.getByRole('dialog', { name: 'QR-код Salah' })
    const qr = dialog.getByRole('img', { name: 'QR-код со ссылкой на Salah' })
    await expect(qr).toHaveAttribute('src', '/salah-pwa/share-qr.svg')
    await dialog.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished))
    })

    const layout = await dialog.evaluate((element) => {
      const dialogBounds = element.getBoundingClientRect()
      const dialogStyle = getComputedStyle(element)
      const qr = element.querySelector('.share-qr')
      const qrFrame = element.querySelector('.share-qr-frame')
      const copyButton = element.querySelector('.share-copy-button')
      const closeButton = element.querySelector('.share-close-button:not(.share-copy-button)')
      const content = element.querySelector('.share-content')
      if (!qr || !qrFrame || !copyButton || !closeButton || !content) {
        throw new Error('Не найдены элементы share-диалога')
      }
      const qrBounds = qr.getBoundingClientRect()
      const qrFrameBounds = qrFrame.getBoundingClientRect()
      const copyButtonBounds = copyButton.getBoundingClientRect()
      const closeButtonBounds = closeButton.getBoundingClientRect()
      return {
        blockStartInset: qrFrameBounds.top - dialogBounds.top,
        buttonGap: closeButtonBounds.top - copyButtonBounds.bottom,
        closeButtonHeight: closeButtonBounds.height,
        closeButtonWidth: closeButtonBounds.width,
        contentGap: Number.parseFloat(getComputedStyle(content).rowGap),
        dialogLeft: dialogBounds.left,
        dialogRight: dialogBounds.right,
        dialogOverflow: element.scrollHeight - element.clientHeight,
        paddingBlockStart: Number.parseFloat(dialogStyle.paddingBlockStart),
        paddingInlineStart: Number.parseFloat(dialogStyle.paddingInlineStart),
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
        inlineStartInset: qrFrameBounds.left - dialogBounds.left,
        qrFrameWidth: qrFrameBounds.width,
        qrWidth: qrBounds.width,
      }
    })

    expect(layout.dialogLeft).toBeGreaterThanOrEqual(0)
    expect(layout.dialogRight).toBeLessThanOrEqual(319)
    expect(layout.dialogOverflow).toBe(0)
    expect(layout.paddingBlockStart).toBeGreaterThan(layout.paddingInlineStart)
    expect(Math.abs(layout.blockStartInset - layout.inlineStartInset)).toBeLessThanOrEqual(1)
    expect(layout.pageOverflow).toBeLessThanOrEqual(0)
    expect(layout.qrWidth).toBeGreaterThanOrEqual(220)
    expect(layout.contentGap).toBeGreaterThanOrEqual(12)
    expect(Math.abs(layout.buttonGap - layout.contentGap)).toBeLessThanOrEqual(2)
    expect(layout.closeButtonHeight).toBeGreaterThanOrEqual(50)
    expect(Math.abs(layout.closeButtonWidth - layout.qrFrameWidth)).toBeLessThanOrEqual(1)

    await page.locator('.share-layer').dispatchEvent('pointerdown', { pointerType: 'touch' })
    await expect(dialog).toHaveCount(0)
    await expect(shareButton).toBeFocused()
  })

  test('оставляет внутренний отступ у текущего намаза на 380 px', async ({ page }) => {
    await page.setViewportSize({ width: 380, height: 1324 })
    await page.goto('./')

    const inset = await page.locator('.next-name').evaluate((element) => {
      const panelElement = element.closest('.next-prayer-panel')
      if (!panelElement) throw new Error('Не найдена панель текущего намаза')
      const panel = panelElement.getBoundingClientRect()
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

  test('возвращает фокус на trigger без touch-обводки после закрытия диалога', async ({ page }) => {
    await page.goto('./')

    const locationButton = page.getByRole('button', { name: /Казань/ })
    await locationButton.tap()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeFocused()
    await dialog.getByRole('button', { name: 'Закрыть' }).tap()

    await expect(locationButton).toBeFocused()
    await expect(locationButton).toHaveCSS('outline-style', 'none')
  })
})

test.describe('Stage 5 production matrix', () => {
  for (const viewport of stageFiveViewports) {
    test(`${viewport.label}: сохраняет геометрию, шрифт и модальные поверхности`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.route('**/data/cities-current.json', (route) => route.abort())
      await page.goto('./')
      await page.evaluate(() => document.fonts.ready)
      await expect(page.getByRole('heading', { name: 'Salah' })).toBeVisible()

      await expectNoHorizontalOverflow(page)
      const appFrame = page.locator('.app-frame')
      const appBounds = await appFrame.boundingBox()
      expect(appBounds).not.toBeNull()
      const visibleAppBounds = required(appBounds, 'bounds приложения')
      expect(visibleAppBounds.x).toBeGreaterThanOrEqual(-1)
      expect(visibleAppBounds.x + visibleAppBounds.width).toBeLessThanOrEqual(viewport.width + 1)

      const typography = await page.locator([
        '.brand',
        '.next-name',
        '.countdown-value',
        '.prayer-name',
        '.prayer-time',
      ].join(',')).evaluateAll((elements) => elements.map((element) => {
        const style = getComputedStyle(element)
        return {
          family: style.fontFamily,
          horizontalOverflow: element.scrollWidth - element.clientWidth,
          numeric: element.classList.contains('prayer-time')
            || element.classList.contains('countdown-value')
            ? style.fontVariantNumeric
            : null,
        }
      }))
      expect(typography.every(({ family }) => family.includes('Alegreya Sans'))).toBe(true)
      expect(typography.every(({ horizontalOverflow }) => horizontalOverflow <= 1)).toBe(true)
      expect(
        typography
          .filter(({ numeric }) => numeric !== null)
          .every(({ numeric }) => numeric === 'tabular-nums'),
      ).toBe(true)
      await expectControlTargetsAtLeast44Px(page.locator('body'))

      await page.getByRole('button', { name: /Казань/ }).click()
      let dialog = page.getByRole('dialog')
      await expectInsideViewport(dialog, page)
      await expect(page.locator('.app-background')).toHaveAttribute('inert', '')
      await expect(page.locator('.app-background')).toHaveAttribute('aria-hidden', 'true')
      expect(await dialog.evaluate((element) => element.closest('[inert]'))).toBeNull()
      await expectControlTargetsAtLeast44Px(dialog)

      await dialog.getByRole('button', { name: 'Найти город или район' }).click()
      dialog = page.getByRole('dialog', { name: 'Поиск населённого пункта' })
      await expectInsideViewport(dialog, page)
      await expectNoHorizontalOverflow(page)
      await expectControlTargetsAtLeast44Px(dialog)
      await dialog.getByRole('button', { name: 'Закрыть' }).click()

      await page.getByRole('button', { name: 'Настройки автономного расчёта' }).click()
      dialog = page.getByRole('dialog', { name: 'Настройки расчёта' })
      await expectInsideViewport(dialog, page)
      const settings = dialog.getByRole('combobox')
      await expect(settings).toHaveCount(3)
      for (const select of await settings.all()) {
        await expect(select).toBeDisabled()
        await expect(select).toHaveAttribute('aria-disabled', 'true')
      }
      await expectControlTargetsAtLeast44Px(dialog)
      await dialog.getByRole('button', { name: 'Закрыть' }).click()

      await page.getByRole('button', { name: 'Поделиться', exact: true }).click()
      dialog = page.getByRole('dialog', { name: 'QR-код Salah' })
      await expectInsideViewport(dialog, page)
      await expectControlTargetsAtLeast44Px(dialog)
      await dialog.getByRole('button', { name: 'Закрыть' }).click()
      await expectNoHorizontalOverflow(page)
    })
  }

  test('keyboard-only путь удерживает фокус в modal и возвращает его trigger', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('./')

    const locationButton = page.getByRole('button', { name: /Казань/ })
    await expect(locationButton).toBeVisible()
    for (let step = 0; step < 8; step += 1) {
      if (await locationButton.evaluate((element) => element === document.activeElement)) break
      await page.keyboard.press('Tab')
    }
    await expect(locationButton).toBeFocused()
    await page.keyboard.press('Enter')

    const dialog = page.getByRole('dialog', { name: 'Выбор местоположения' })
    await expect(dialog).toBeFocused()
    expect(await dialog.evaluate((element) => element.closest('[inert]'))).toBeNull()
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: 'Закрыть' })).toBeFocused()
    await page.keyboard.press('Escape')

    await expect(dialog).toHaveCount(0)
    await expect(locationButton).toBeFocused()
  })

  test('копирует ссылку без видимого лейбла и сохраняет фокус в share-dialog', async ({ context, page }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('./')
    await page.getByRole('button', { name: 'Поделиться', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'QR-код Salah' })
    const copyButton = dialog.getByRole('button', { name: 'Скопировать ссылку' })

    await copyButton.click()

    await expect(dialog.getByRole('status')).toHaveText('Ссылка скопирована')
    await expect(dialog.getByRole('status')).toHaveClass('sr-only')
    await expect(copyButton).toBeFocused()
    await expect(dialog).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url())
  })

  test('показывает номер локальной или релизной сборки', async ({ page }) => {
    await page.goto('./')

    await expect(page.locator('.app-version')).toBeVisible()
    await expect(page.locator('.app-version')).toHaveText(/^v\d+(?:\.\d+)+$/)
  })

  test('объявляет ошибку Clipboard API без закрытия и потери фокуса', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: () => Promise.reject(new Error('denied')),
        },
      })
    })
    await page.goto('./')
    await page.getByRole('button', { name: 'Поделиться', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'QR-код Salah' })
    const copyButton = dialog.getByRole('button', { name: 'Скопировать ссылку' })

    await copyButton.click()

    await expect(dialog.getByRole('status')).toHaveText('Не удалось скопировать ссылку')
    await expect(dialog.getByRole('status')).toHaveAttribute('aria-live', 'polite')
    await expect(copyButton).toBeFocused()
    await expect(dialog).toBeVisible()
  })

  test('сохраняет safe-area правила и выключает необязательное движение', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('./')
    await expect(page.getByRole('heading', { name: 'Salah' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Поделиться', exact: true })).toBeVisible()

    const result = await page.evaluate(() => {
      const css = Array.from(document.styleSheets)
        .flatMap((sheet) => Array.from(sheet.cssRules))
        .map((rule) => rule.cssText)
        .join('\n')
      const app = document.querySelector('.app-frame')
      const share = document.querySelector('.share-button')
      if (!app || !share) throw new Error('Не найдены основные поверхности')
      const appStyle = getComputedStyle(app)
      const shareStyle = getComputedStyle(share)
      return {
        animationDuration: appStyle.animationDuration,
        hasSafeAreaRules: css.includes('env(safe-area-inset-top)')
          && css.includes('env(safe-area-inset-right)')
          && css.includes('env(safe-area-inset-bottom)')
          && css.includes('env(safe-area-inset-left)'),
        transitionDuration: shareStyle.transitionDuration,
      }
    })

    expect(result.hasSafeAreaRules).toBe(true)
    const toSeconds = (duration: string) => duration.trim().endsWith('ms')
      ? Number.parseFloat(duration) / 1_000
      : Number.parseFloat(duration)
    expect(result.animationDuration.split(',').every((duration) => toSeconds(duration) <= 0.001)).toBe(true)
    expect(result.transitionDuration.split(',').every((duration) => toSeconds(duration) <= 0.001)).toBe(true)
  })

  test('сохраняет светлую и тёмную темы и пишет representative screenshots', async ({ page }) => {
    const captures = [
      {
        colorScheme: 'light' as const,
        path: '/tmp/salah-pwa-stage5-mobile-portrait-light.png',
        viewport: { width: 390, height: 844 },
      },
      {
        colorScheme: 'light' as const,
        path: '/tmp/salah-pwa-stage5-mobile-landscape-light.png',
        viewport: { width: 844, height: 390 },
      },
      {
        colorScheme: 'light' as const,
        path: '/tmp/salah-pwa-stage5-desktop-light.png',
        viewport: { width: 1440, height: 900 },
      },
      {
        colorScheme: 'dark' as const,
        path: '/tmp/salah-pwa-stage5-desktop-dark.png',
        viewport: { width: 1440, height: 900 },
      },
    ]

    let lightPaper = ''
    for (const capture of captures) {
      await page.setViewportSize(capture.viewport)
      await page.emulateMedia({ colorScheme: capture.colorScheme, reducedMotion: 'reduce' })
      await page.goto('./')
      await expect(page.getByRole('button', { name: /Казань/ })).toBeVisible()
      await expect(page.getByRole('timer')).toBeVisible()
      await expect(page.getByRole('list', { name: 'Времена намаза' })).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      const paper = await page.locator('.app-frame').evaluate((element) => getComputedStyle(element).backgroundColor)
      if (capture.colorScheme === 'light') lightPaper = paper
      else expect(paper).not.toBe(lightPaper)
      await page.screenshot({ path: capture.path, fullPage: true })
    }
  })
})
