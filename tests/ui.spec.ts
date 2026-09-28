import type { Locator, Page } from '@playwright/test'
import { back, chooseDate, choosePlace, expectSchedule, openSource, readSavedSetting, setSource, expect, test } from './fixtures'

async function geometry(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('data-theme-tone', 'light')
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  const panel = page.locator('.app-screen')
  const textSizes = await panel.evaluate(node => [...node.querySelectorAll<HTMLElement>('*')]
    .filter(element => element.getClientRects().length && [...element.childNodes].some(child => child.nodeType === Node.TEXT_NODE && child.textContent?.trim()))
    .map(element => getComputedStyle(element).fontSize))
  expect([...new Set(textSizes)].every(size => ['14px', '16px', '18px', '20px'].includes(size))).toBe(true)
  await expect(panel).toHaveCSS('padding', '16px')
  await expect(panel).toHaveCSS('border-radius', '0px')
  await expect(panel).toHaveCSS('background-color', 'rgb(242, 242, 238)')
  const bounds = await panel.boundingBox()
  const viewport = page.viewportSize()
  if (!bounds || !viewport) throw new Error('Нет размеров экрана')
  expect(bounds.x).toBeCloseTo(0, 0)
  expect(bounds.width).toBeCloseTo(viewport.width, 0)
  await expect(page.locator('.app-layout')).toHaveCSS('padding-left', '0px')
  await expect(page.locator('.app-layout')).toHaveCSS('padding-right', '0px')
  expect(bounds.y).toBeGreaterThanOrEqual(0)
  expect(bounds.y + bounds.height).toBeCloseTo(viewport.height, 0)
  for (const part of ['.screen-top', '.screen-bottom']) {
    const node = page.locator(part)
    if (!await node.count()) continue
    const rect = await node.boundingBox()
    if (!rect) throw new Error('Нет размеров кнопок')
    expect(rect.x - bounds.x).toBeCloseTo(16, 0)
    expect(bounds.x + bounds.width - rect.x - rect.width).toBeCloseTo(16, 0)
    if (part === '.screen-top') expect(rect.y - bounds.y).toBeCloseTo(16, 0)
    else expect(bounds.y + bounds.height - rect.y - rect.height).toBeCloseTo(16, 0)
  }
  for (const button of await panel.locator('button, input, select, summary').all()) {
    const rect = await button.boundingBox()
    if (rect) {
      expect(rect.width).toBeGreaterThanOrEqual(44)
      expect(rect.height).toBeGreaterThanOrEqual(44)
    }
  }
}

async function aligned(left: Locator, right: Locator) {
  const a = await left.boundingBox(), b = await right.boundingBox()
  if (!a || !b) throw new Error('Нет размеров элементов')
  expect(a.x).toBeCloseTo(b.x, 0)
}

for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 900 }]) {
  test(`${viewport.width}×${viewport.height}: экраны, поля 16, единая типографика и доступные действия`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize(viewport)
    await page.goto('./')
    await choosePlace(page)
    await expect(page).toHaveTitle(/Salah/)
    await expect(page.locator('.event-row[aria-current=true]')).toContainText('Зухр')
    await geometry(page)
    await expect(page.getByRole('heading', { name: 'Salah' })).toHaveCount(0)
    await page.screenshot({ path: `/tmp/salah-final-home-${viewport.width}.png` })
    await expectSchedule(page)
    await geometry(page)
    for (const row of await page.locator('.event-row').all()) await expect(row).toHaveCSS('font-size', '18px')
    await expect(page.locator('.countdown-label')).toHaveCSS('font-size', '18px')
    await expect(page.locator('.countdown-value')).toHaveCSS('font-size', '20px')
    const footer = page.locator('.screen-bottom')
    const current = page.locator('.event-row[aria-current=true]')
    const next = page.locator('.event-row[aria-current=true] + .event-row')
    const timer = page.getByRole('timer')
    for (const control of ['#home-location', '#home-date', '#home-settings']) {
      await expect(page.locator(control)).toHaveCSS('height', '48px')
    }
    await expect(footer).toHaveCSS('height', '48px')
    await expect(current).toContainText('Зухр')
    await expect(current).not.toContainText('сейчас')
    await expect(current).toHaveCSS('background-color', 'rgb(227, 227, 222)')
    await expect(current).toHaveCSS('border-radius', '0px')
    const listBounds = await page.locator('.event-list').boundingBox()
    const panelBounds = await page.locator('.app-screen').boundingBox()
    const contentBounds = await page.locator('.screen-content.home-content').boundingBox()
    const currentBounds = await current.boundingBox()
    const currentNameBounds = await current.locator('.event-name').boundingBox()
    const currentTimeBounds = await current.locator('time').boundingBox()
    if (!listBounds || !panelBounds || !contentBounds || !currentBounds || !currentNameBounds || !currentTimeBounds) throw new Error('Нет геометрии текущего события')
    expect(contentBounds.x).toBeCloseTo(panelBounds.x, 0)
    expect(contentBounds.width).toBeCloseTo(panelBounds.width, 0)
    expect(currentBounds.x).toBeCloseTo(panelBounds.x, 0)
    expect(currentBounds.width).toBeCloseTo(panelBounds.width, 0)
    expect(currentNameBounds.x).toBeCloseTo(listBounds.x + 4, 0)
    expect(currentTimeBounds.x + currentTimeBounds.width).toBeCloseTo(listBounds.x + listBounds.width - 4, 0)
    const currentCenter = currentBounds.y + currentBounds.height / 2
    expect(currentNameBounds.y + currentNameBounds.height / 2).toBeCloseTo(currentCenter, 0)
    expect(currentTimeBounds.y + currentTimeBounds.height / 2).toBeCloseTo(currentCenter, 0)
    await expect(next).not.toHaveAttribute('aria-current')
    await expect(next).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    const nextClockTime = await next.locator('time').innerText()
    await expect(timer).not.toContainText(nextClockTime)
    const settings = page.getByRole('button', { name: 'Настройки', exact: true })
    await expect(settings.locator('svg path')).toHaveCount(1)
    await expect(settings.locator('svg circle')).toHaveCount(1)
    expect(await settings.innerText()).toBe('')
    const fajr = page.getByText('Фаджр в мечети', { exact: true })
    expect(await fajr.evaluate(node => node.getClientRects().length)).toBe(1)
    await page.screenshot({ path: `/tmp/salah-final-schedule-${viewport.width}.png` })
    await page.locator('#home-location').click()
    await geometry(page)
    await aligned(page.getByRole('button', { name: 'Назад' }), page.getByRole('button', { name: 'Найти город' }))
    await page.getByRole('button', { name: 'Найти город' }).click()
    await page.getByRole('searchbox').fill('Стамбул')
    const result = page.getByRole('button', { name: 'Стамбул, Стамбул, Турция', exact: true })
    await expect(result).toBeVisible()
    await geometry(page)
    await aligned(page.getByRole('button', { name: 'Отмена' }), page.getByRole('searchbox'))
    await aligned(page.getByRole('searchbox'), result)
    await expect(result).toHaveCSS('border-radius', '16px')
    await page.screenshot({ path: `/tmp/salah-final-search-${viewport.width}.png` })
    await page.getByRole('button', { name: 'Отмена' }).click()
    await expect(page.getByRole('button', { name: 'Найти город' })).toBeFocused()
    await back(page)
    await openSource(page)
    await geometry(page)
    await expect(page.locator('.screen-title')).toHaveCSS('font-size', '20px')
    await setSource(page, 'Ручной расчёт')
    await page.getByRole('button', { name: 'Параметры' }).click()
    await geometry(page)
    await back(page)
    await back(page)
    await page.getByRole('button', { name: 'Поделиться' }).click()
    await geometry(page)
    await expect(page.getByRole('textbox')).toHaveCSS('text-align', 'center')
    const qr = await page.getByRole('img', { name: /QR-код/ }).boundingBox()
    const link = await page.getByRole('textbox').boundingBox()
    if (!qr || !link) throw new Error('Нет QR или ссылки')
    expect(qr.y + qr.height).toBeLessThan(link.y)
    await page.screenshot({ path: `/tmp/salah-final-share-${viewport.width}.png` })
    expect(errors).toEqual([])
  })
}

test('верхняя полоса ограничена установленной portrait PWA с touch-указателем', async ({ page }) => {
  await page.goto('./')
  const spacing = await page.evaluate(() => {
    const rules = Array.from(document.styleSheets).flatMap(sheet => Array.from(sheet.cssRules))
    const base = rules.find((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule && rule.selectorText === '.app-layout')
    const mobile = rules.find((rule): rule is CSSMediaRule => rule instanceof CSSMediaRule
      && rule.conditionText.includes('(display-mode: standalone)')
      && rule.conditionText.includes('(orientation: portrait)')
      && rule.conditionText.includes('(pointer: coarse)'))
    const layout = Array.from(mobile?.cssRules ?? []).find((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule && rule.selectorText === '.app-layout')
    return { base: base?.style.paddingTop, mobile: layout?.style.paddingTop, background: base?.style.background }
  })
  expect(spacing).toEqual({ base: '0px', mobile: '6px', background: 'var(--background-primary)' })
  await expect(page.locator('.app-layout')).toHaveCSS('padding-top', '0px')
})

test('контейнер доходит до низа, а нижний контент учитывает safe area и клавиатуру', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await page.evaluate(() => {
    // Браузерная эмуляция iPhone не задаёт env(safe-area-inset-bottom).
    const rule = Array.from(document.styleSheets).flatMap(sheet => Array.from(sheet.cssRules))
      .find((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule && rule.selectorText === '.app-screen'
        && rule.style.getPropertyValue('--screen-bottom-inset').includes('env(safe-area-inset-bottom'))
    if (!rule) throw new Error('Нет правила нижней безопасной области контента')
    rule.style.setProperty('--screen-bottom-inset', rule.style.getPropertyValue('--screen-bottom-inset').replace(/env\(safe-area-inset-bottom,\s*0px\)/, '34px'))
  })
  await expect(page.locator('.app-layout')).toHaveCSS('padding-bottom', '0px')
  await expect(page.locator('.app-screen')).toHaveCSS('padding-bottom', '34px')
  await choosePlace(page)
  const home = await page.locator('.app-screen').boundingBox()
  const footer = await page.locator('.screen-bottom').boundingBox()
  if (!home || !footer) throw new Error('Нет геометрии главного экрана')
  expect(home.y + home.height).toBeCloseTo(844, 0)
  expect(home.y + home.height - footer.y - footer.height).toBeCloseTo(34, 0)
  await page.screenshot({ path: '/tmp/salah-home-safe-area.png' })
  await page.locator('#home-location').click()
  await page.getByRole('button', { name: 'Найти город' }).click()
  await page.getByRole('searchbox').fill('Москва')
  await expect(page.getByRole('button', { name: 'Москва, Москва, Россия' })).toBeVisible()
  await page.evaluate(() => {
    const viewport = window.visualViewport
    if (!viewport) throw new Error('Нет visualViewport')
    Object.defineProperties(viewport, { height: { configurable: true, value: 360 }, offsetTop: { configurable: true, value: 40 } })
    viewport.dispatchEvent(new Event('resize'))
  })
  await expect(page.locator('.app-layout')).toHaveCSS('height', '360px')
  await expect(page.locator('.app-layout')).toHaveCSS('top', '40px')
  await expect(page.locator('.app-layout')).toHaveCSS('padding-bottom', '0px')
  await expect(page.locator('.app-screen')).toHaveCSS('padding-bottom', '16px')
  const panel = await page.locator('.app-screen').boundingBox()
  if (!panel) throw new Error('Нет контейнера поиска')
  expect(400 - panel.y - panel.height).toBeCloseTo(0, 0)
  const result = await page.getByRole('button', { name: 'Москва, Москва, Россия' }).boundingBox()
  if (!result) throw new Error('Результат скрыт')
  expect(result.y + result.height).toBeLessThanOrEqual(400)
  await page.screenshot({ path: '/tmp/salah-final-keyboard.png' })
  await page.evaluate(() => {
    const viewport = window.visualViewport
    if (!viewport) throw new Error('Нет visualViewport')
    Reflect.deleteProperty(viewport, 'height'); Reflect.deleteProperty(viewport, 'offsetTop')
    viewport.dispatchEvent(new Event('resize'))
  })
  await expect(page.locator('.app-layout')).toHaveCSS('height', '844px')
  await expect(page.locator('.app-layout')).toHaveCSS('padding-bottom', '0px')
  await expect(page.locator('.app-screen')).toHaveCSS('padding-bottom', '34px')
  await page.getByRole('button', { name: 'Отмена' }).click()
  await expect(page.getByRole('button', { name: 'Найти город' })).toBeFocused()
})

test('выбор даты возвращает на главную, Сегодня возвращает живое расписание', async ({ page, context }) => {
  await page.goto('./')
  await choosePlace(page)
  await chooseDate(page, '2026-09-01')
  expect(context.pages()).toHaveLength(1)
  await expect(page.getByRole('listitem')).toHaveCount(8)
  await expect(page.getByRole('timer')).toHaveCount(0)
  await expect(page.locator('[aria-current=true]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Сегодня' }).click()
  await expect(page.getByRole('timer')).toBeVisible()
  await expect(page.locator('#home-date time')).toHaveAttribute('datetime', '2026-09-04')
})

test('боковая safe area защищает содержимое, не сужая контейнер', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await page.goto('./')
  await choosePlace(page)
  await page.evaluate(() => {
    const rule = Array.from(document.styleSheets).flatMap(sheet => Array.from(sheet.cssRules))
      .find((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule && rule.selectorText === '.app-screen')
    if (!rule) throw new Error('Нет правила контейнера')
    // Safe area хранится в переменных, чтобы те же inset использовали вложенные edge-to-edge блоки.
    for (const [property, inset] of [
      ['--screen-inset-left', 'safe-area-inset-left'],
      ['--screen-inset-right', 'safe-area-inset-right'],
    ] as const) {
      const value = rule.style.getPropertyValue(property)
      if (!value.includes(`env(${inset})`)) throw new Error(`Нет ${inset} в ${property}`)
      rule.style.setProperty(property, value.replace(`env(${inset})`, '47px'))
    }
  })
  const bounds = await page.locator('.app-screen').boundingBox()
  expect(bounds?.x).toBe(0)
  expect(bounds?.width).toBe(844)
  await expect(page.locator('.app-screen')).toHaveCSS('padding-left', '47px')
  await expect(page.locator('.app-screen')).toHaveCSS('padding-right', '47px')
  const top = await page.locator('.screen-top').boundingBox()
  expect(top?.x).toBe(47)
  expect(top?.width).toBe(750)
})

test('клавиатура и браузерный возврат восстанавливают фокус без скрытых экранов', async ({ page }) => {
  await page.goto('./')
  await choosePlace(page)
  await page.locator('#home-location').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Назад' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Найти город' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('searchbox')).toBeFocused()
  await page.goBack()
  await expect(page.getByRole('button', { name: 'Найти город' })).toBeFocused()
  await page.goBack()
  await expect(page.locator('#home-location')).toBeFocused()
  await expect(page.locator('.app-screen')).toHaveCount(1)
})

test('поделиться копирует каноническую ссылку; отказ буфера оставляет выделенный адрес', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('./')
  await page.getByRole('button', { name: 'Настройки' }).click()
  await page.getByRole('button', { name: 'Поделиться' }).click()
  await page.getByRole('button', { name: 'Скопировать ссылку' }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('https://halsab.github.io/salah-pwa/')
  await expect(page.getByRole('button', { name: 'Скопировано' })).toBeVisible()
  await back(page)
  await expect(page.getByRole('button', { name: 'Поделиться' })).toBeFocused()
  await page.getByRole('button', { name: 'Поделиться' }).click()
  await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('denied')) })
  await page.getByRole('button', { name: 'Скопировать ссылку' }).click()
  await expect(page.getByRole('textbox')).toBeFocused()
  expect(await page.getByRole('textbox').evaluate((node: HTMLTextAreaElement) => node.selectionEnd - node.selectionStart)).toBe('https://halsab.github.io/salah-pwa/'.length)
  await expect(page.getByRole('status')).toContainText('Скопируйте')
})

test('системная цветовая схема не меняет солнечный tone; недавних не больше трёх, текущий город исключён', async ({ page }) => {
  await page.goto('./')
  await choosePlace(page)
  for (const name of ['Набережные Челны', 'Апастово', 'Арск', 'Балтаси']) await choosePlace(page, name, new RegExp(`${name}.*ДУМ РТ`))
  await page.locator('#home-location').click()
  const recent = page.getByRole('region', { name: 'Недавние города' })
  await expect(recent.getByRole('button')).toHaveCount(3)
  await expect(recent.getByRole('button', { name: 'Балтаси' })).toHaveCount(0)
  await page.reload()
  await page.locator('#home-location').click()
  await expect(recent.getByRole('button')).toHaveCount(3)
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)')
    await expect(page.locator('.app-screen')).toHaveCSS('background-color', 'rgb(242, 242, 238)')
    await expect(page.locator('html')).toHaveAttribute('data-theme-tone', 'light')
  }
})

test('classic и все сезонные палитры меняют ровно шесть цветов по текущему дню', async ({ page }) => {
  const expected = {
    'classic-light': ['#000000', '#F2F2EE', '#E3E3DE', '#181818', '#5F5F5A', '#B34900'],
    'classic-dark': ['#000000', '#282828', '#383838', '#FFFFFF', '#A8A8A8', '#FF8A3D'],
    'winter-light': ['#B7C8D2', '#F3F6F7', '#D7E0E4', '#222A2F', '#536168', '#476A7E'],
    'winter-dark': ['#4E6270', '#171D21', '#35444D', '#F1F4F6', '#BBC6CC', '#8EB6C9'],
    'spring-light': ['#BBD0BA', '#F2F6F1', '#D4E0D2', '#263028', '#556156', '#557759'],
    'spring-dark': ['#516858', '#18201A', '#37463A', '#F1F5F1', '#BDCAC0', '#97B798'],
    'summer-light': ['#B9D0CD', '#F6F3E9', '#D9DDCC', '#29302B', '#566158', '#796738'],
    'summer-dark': ['#536C70', '#1D211C', '#3C4940', '#F4F2E9', '#C6C9BB', '#CDB77D'],
    'autumn-light': ['#D6B29B', '#F7F1EC', '#DFD0C5', '#2E2622', '#655750', '#8A5033'],
    'autumn-dark': ['#6E5146', '#211C1A', '#493B35', '#F5EFEA', '#CABCB3', '#DFA774'],
  } as const
  const variables = ['--background-primary', '--background-secondary', '--background-tertiary', '--text-primary', '--text-secondary', '--accent-countdown']
  const expectPalette = async (name: keyof typeof expected) => {
    await expect(page.locator('html')).toHaveAttribute('data-theme', name.startsWith('classic') ? 'classic' : 'seasonal')
    await expect(page.locator('html')).toHaveAttribute('data-theme-tone', name.endsWith('light') ? 'light' : 'dark')
    expect(await page.locator('html').evaluate((root, properties) => properties.map(property => getComputedStyle(root).getPropertyValue(property).trim()), variables)).toEqual(expected[name])
  }

  await page.goto('./')
  await choosePlace(page)
  await expectPalette('classic-light')
  await page.clock.setFixedTime(new Date('2026-09-04T21:00:00.000Z'))
  await page.reload()
  await expectPalette('classic-dark')
  await page.getByRole('button', { name: 'Настройки', exact: true }).click()
  const theme = page.getByRole('combobox', { name: 'Тема' })
  await expect(theme).toHaveValue('classic')
  await expect(theme.getByRole('option')).toHaveCount(2)
  await theme.selectOption('seasonal')
  await expect.poll(() => readSavedSetting(page, 'themeFamily')).toBe('seasonal')

  for (const [season, month] of [['winter', '01'], ['spring', '04'], ['summer', '07'], ['autumn', '10']] as const) {
    for (const [tone, hour] of [['light', '09'], ['dark', '21']] as const) {
      await page.clock.setFixedTime(new Date(`2026-${month}-15T${hour}:00:00.000Z`))
      await page.reload()
      await expect(page.locator('html')).toHaveAttribute('data-season', season)
      await expectPalette(`${season}-${tone}`)
      await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', expected[`${season}-${tone}`][0])
      expect(await page.evaluate(() => document.documentElement.style.length)).toBe(7)
    }
  }
})


test('увеличение текста вдвое сохраняет читаемый список и доступ к действиям', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await choosePlace(page)
  await page.evaluate(() => { document.documentElement.style.fontSize = '32px' })
  await expectSchedule(page)
  await expect(page.locator('.event-row').first()).toHaveCSS('font-size', '36px')
  expect(await page.locator('.screen-content').evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1)
  await page.getByText('Иша', { exact: true }).scrollIntoViewIfNeeded()
  await expect(page.getByText('Иша', { exact: true })).toBeInViewport()
  await page.getByRole('button', { name: 'Настройки', exact: true }).click()
  await page.getByRole('button', { name: 'Данные и конфиденциальность' }).click()
  await expect(page.getByRole('button', { name: 'Удалить данные' })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: '/tmp/salah-final-text-200.png' })
})
