import { back, chooseDate, choosePlace, expectSchedule, expect, test } from './fixtures'

test('главный экран, расписание и touch-цели пригодны на мобильном Safari', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('./')
  await choosePlace(page)
  await expectSchedule(page)
  await expect(page.getByRole('timer')).toBeVisible()
  for (const control of ['#home-location', '#home-date', '#home-settings']) {
    const rect = await page.locator(control).boundingBox()
    expect(rect?.width).toBeGreaterThanOrEqual(44)
    expect(rect?.height).toBeGreaterThanOrEqual(44)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})

test('экран даты и возврат сохраняют фокус и расписание', async ({ page }) => {
  await page.goto('./')
  await choosePlace(page)
  await chooseDate(page, '2024-01-31')
  await page.getByRole('button', { name: 'Выбрать дату' }).click()
  await page.getByRole('combobox', { name: 'Месяц' }).selectOption('2')
  await expect(page.getByRole('combobox', { name: 'День' })).toHaveValue('29')
  await back(page)
  await expect(page.locator('#home-date')).toBeFocused()
  await expect(page.locator('#home-date time')).toHaveAttribute('datetime', '2024-02-29')
  await expect(page.getByRole('list', { name: 'Расписание дня' })).toBeVisible()
})

test('поиск остаётся доступен в уменьшенной видимой области', async ({ page }) => {
  await page.goto('./')
  await choosePlace(page)
  await page.locator('#home-location').click()
  await page.getByRole('button', { name: 'Найти город' }).click()
  await expect(page.getByRole('searchbox')).toBeFocused()
  await page.getByRole('searchbox').fill('Москва')
  await expect(page.getByRole('button', { name: 'Москва, Москва, Россия' })).toBeVisible()
  const visibleHeight = await page.evaluate(() => {
    const viewport = window.visualViewport
    if (!viewport) throw new Error('Нет visualViewport')
    // Потеря высоты должна превысить порог AppShell для открытой клавиатуры.
    const height = Math.min(300, document.documentElement.clientHeight - 130)
    Object.defineProperties(viewport, {
      height: { configurable: true, value: height },
      offsetTop: { configurable: true, value: 30 },
    })
    viewport.dispatchEvent(new Event('resize'))
    return height
  })
  await expect(page.locator('.app-layout')).toHaveCSS('height', `${visibleHeight}px`)
  await expect(page.locator('.app-layout')).toHaveCSS('padding-bottom', '0px')
  await expect(page.locator('.app-screen')).toHaveCSS('padding-bottom', '16px')
  const panel = await page.locator('.app-screen').boundingBox()
  if (!panel) throw new Error('Нет контейнера поиска')
  expect(visibleHeight + 30 - panel.y - panel.height).toBeCloseTo(0, 0)
  const result = await page.getByRole('button', { name: 'Москва, Москва, Россия' }).boundingBox()
  if (!result) throw new Error('Результат скрыт')
  expect(result.y + result.height).toBeLessThanOrEqual(visibleHeight + 30)
})

test('нижняя безопасная область не перекрывает нижнее действие', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await choosePlace(page)
  await page.locator('.app-screen').evaluate((element) => {
    // Браузерная эмуляция iPhone не задаёт env(safe-area-inset-bottom).
    element.style.setProperty('--screen-bottom-inset', '34px')
  })
  await expect(page.locator('.app-layout')).toHaveCSS('padding-bottom', '0px')
  await expect(page.locator('.app-screen')).toHaveCSS('padding-bottom', '34px')
  const home = await page.locator('.app-screen').boundingBox()
  const footer = await page.locator('.screen-bottom').boundingBox()
  if (!home || !footer) throw new Error('Нет геометрии главного экрана')
  expect(home.y + home.height).toBeCloseTo(844, 0)
  expect(home.y + home.height - footer.y - footer.height).toBeCloseTo(34, 0)
})

test('список праздников и статья работают на узком экране', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 })
  await page.goto('./')
  await choosePlace(page)
  await page.locator('#home-date').click()
  const dateScreen = page.getByRole('region', { name: 'Установка даты' })
  await dateScreen.getByRole('button', { name: 'Праздники и события' }).click()
  const list = page.getByRole('region', { name: 'Праздники и события' })
  await expect(list).toBeVisible()
  const ids = await list.locator('button.religious-event-list-row')
    .evaluateAll((rows) => rows.map((row) => row.id))
  expect(ids).toEqual([...ids].sort())
  await expect(list.getByText('Начало Рамадана', { exact: true })).toBeVisible()
  await expect(list.getByText('Начало Зуль-хиджи', { exact: true })).toBeVisible()
  await expect(list.getByText('Дни ташрика', { exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(1)
  const ramadan = list.getByRole('button', { name: /Начало Рамадана/ })
  const listContent = list.locator('.screen-content')
  await ramadan.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest' }))
  expect(await listContent.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  await ramadan.click()
  const article = page.getByRole('region', { name: 'Рамадан' })
  await expect(article.getByRole('heading', { level: 1 })).toHaveText('Рамадан')
  const savedScrollTop = await page.evaluate(() => {
    const state = history.state as { salahNavigation?: { entries?: Array<{ scrollTop?: number }> } } | null
    return state?.salahNavigation?.entries?.at(-2)?.scrollTop
  })
  expect(savedScrollTop).toBeGreaterThan(0)
  await article.getByRole('button', { name: 'Назад' }).click()
  await expect(list.getByRole('button', { name: /Начало Рамадана/ })).toBeFocused()
  await expect.poll(() => listContent.evaluate(element => element.scrollTop)).toBe(savedScrollTop)
})

test('экранный контент скроллится только по вертикали с Jelly-кнопками', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 420 })
  await page.goto('./')
  await choosePlace(page)

  const content = page.locator('.screen-content')
  const expectVerticalOnly = async () => {
    const sizes = await content.evaluate((node) => ({
      width: node.clientWidth,
      scrollWidth: node.scrollWidth,
      height: node.clientHeight,
      scrollHeight: node.scrollHeight,
    }))
    expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.width)
    return sizes
  }

  await page.locator('#home-date').click()
  await expectVerticalOnly()
  await page.getByRole('button', { name: 'Праздники и события' }).click()
  const events = await expectVerticalOnly()
  expect(events.scrollHeight).toBeGreaterThan(events.height)
  await page.getByRole('button', { name: 'Назад', exact: true }).click()
  await page.getByRole('button', { name: 'Назад', exact: true }).click()
  await page.getByRole('button', { name: 'Настройки', exact: true }).click()
  await page.getByRole('button', { name: 'Данные и конфиденциальность' }).click()

  const privacy = await expectVerticalOnly()
  expect(privacy.scrollHeight).toBeGreaterThan(privacy.height)
  expect(await content.evaluate((node) => getComputedStyle(node).overflowY)).toBe('auto')
  expect(await content.evaluate((node) => {
    node.scrollTop = 100
    return node.scrollTop
  })).toBeGreaterThan(0)
  await expect(page.locator('.screen-top .jelly-action').first()).toHaveCSS('touch-action', 'pan-y')
})

test('увеличение текста вдвое сохраняет список и действия', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await choosePlace(page)
  await page.evaluate(() => { document.documentElement.style.fontSize = '32px' })
  await expectSchedule(page)
  await expect(page.locator('.event-row').first()).toHaveCSS('font-size', '36px')
  expect(await page.locator('.screen-content').evaluate((node) => node.scrollWidth - node.clientWidth))
    .toBeLessThanOrEqual(1)
  await page.getByText('Иша', { exact: true }).scrollIntoViewIfNeeded()
  await expect(page.getByText('Иша', { exact: true })).toBeInViewport()
  await page.getByRole('button', { name: 'Настройки', exact: true }).click()
  await page.getByRole('button', { name: 'Данные и конфиденциальность' }).click()
  await expect(page.getByRole('button', { name: 'Удалить данные' })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(1)
})
