import { choosePlace, expectSchedule, expect, readSavedSetting, test } from './fixtures'

test('Mobile Safari показывает расписание и основные действия без обрезанного контента', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))

  await page.goto('./')
  await choosePlace(page)
  await expectSchedule(page)
  await expect(page.getByRole('timer')).toBeVisible()
  await page.locator('#home-date').click()
  await expect(page.getByRole('region', { name: 'Установка даты' })).toBeVisible()
  await page.getByRole('button', { name: 'Назад', exact: true }).click()
  await expectSchedule(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})

test('поиск города остаётся доступным при уменьшении visual viewport', async ({ page }) => {
  await page.goto('./')
  await choosePlace(page)
  await page.locator('#home-location').click()
  await page.getByRole('button', { name: 'Найти город' }).click()
  const search = page.getByRole('searchbox')
  await search.fill('Москва')
  expect(await page.locator('.screen-content').evaluate(element => parseFloat(getComputedStyle(element).paddingTop))).toBe(16)
  const city = page.getByRole('button', { name: 'Москва, Москва, Россия', exact: true })
  await expect(city).toBeVisible()
  const shellBottomBeforeKeyboard = await page.locator('.app-layout').evaluate(element => element.getBoundingClientRect().bottom)

  await page.evaluate(() => {
    const viewport = window.visualViewport
    if (!viewport) throw new Error('Нет visualViewport')
    Object.defineProperties(viewport, {
      height: { configurable: true, value: Math.min(300, document.documentElement.clientHeight - 130) },
      offsetTop: { configurable: true, value: 30 },
    })
    viewport.dispatchEvent(new Event('resize'))
    return new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  })

  await expect(search).toBeVisible()
  await expect(city).toBeVisible()
  const keyboardGeometry = await page.evaluate(() => {
    const viewport = window.visualViewport
    const shell = document.querySelector<HTMLElement>('.app-layout')
    const content = document.querySelector<HTMLElement>('.screen-content')
    if (!viewport || !shell || !content) throw new Error('Не найдена геометрия keyboard shell')
    const safeAreaProbe = document.createElement('div')
    safeAreaProbe.style.cssText = 'position:fixed;padding-bottom:env(safe-area-inset-bottom, 0px)'
    document.body.append(safeAreaProbe)
    const safeAreaBottom = parseFloat(getComputedStyle(safeAreaProbe).paddingBottom)
    safeAreaProbe.remove()
    const layoutHeight = document.documentElement.clientHeight
    const keyboardInset = Math.max(0, layoutHeight - Math.max(0, viewport.offsetTop) - viewport.height)
    return {
      shellBottom: shell.getBoundingClientRect().bottom,
      panelBottom: content.parentElement?.getBoundingClientRect().bottom ?? 0,
      keyboardInset,
      appliedKeyboardInset: parseFloat(getComputedStyle(shell).getPropertyValue('--app-keyboard-inset')),
      contentBottomPadding: parseFloat(getComputedStyle(content).paddingBottom),
      expectedBottomPadding: Math.max(16, safeAreaBottom, keyboardInset + 16),
      visibleBottom: viewport.offsetTop + viewport.height,
      contentCanScroll: content.scrollHeight > content.clientHeight,
    }
  })
  expect(keyboardGeometry.shellBottom).toBeCloseTo(shellBottomBeforeKeyboard, 0)
  expect(keyboardGeometry.panelBottom).toBeCloseTo(shellBottomBeforeKeyboard, 0)
  expect(keyboardGeometry.appliedKeyboardInset).toBe(keyboardGeometry.keyboardInset)
  expect(keyboardGeometry.contentBottomPadding).toBe(keyboardGeometry.expectedBottomPadding)
  expect(keyboardGeometry.contentCanScroll).toBe(true)

  await page.locator('.screen-content').evaluate(element => { element.scrollTop = element.scrollHeight })
  const lastContentBottom = await page.locator('.screen-content').evaluate(element => element.lastElementChild?.getBoundingClientRect().bottom ?? 0)
  expect(lastContentBottom).toBeLessThanOrEqual(keyboardGeometry.visibleBottom - 15)
  await page.locator('.screen-content').evaluate(element => { element.scrollTop = 0 })
  await city.click()
  await expect(page.locator('#home-location')).toHaveAccessibleName(/^Москва(?: \d{2}:\d{2})?$/)
})

test('интерактивные элементы не попадают под системные safe-area', async ({ page }) => {
  await page.goto('./')
  await choosePlace(page)
  await expectSchedule(page)

  const safeArea = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)'
    document.body.append(probe)
    const style = getComputedStyle(probe)
    const insets = { top: parseFloat(style.paddingTop), bottom: parseFloat(style.paddingBottom) }
    probe.remove()
    return insets
  })
  const controls = await page.evaluate(() => {
    const top = document.querySelector('#home-location')
    const bottom = document.querySelector('#home-settings')
    if (!(top instanceof HTMLElement) || !(bottom instanceof HTMLElement)) throw new Error('Не найдены основные действия')
    return {
      top: top.getBoundingClientRect().top,
      bottom: bottom.getBoundingClientRect().bottom,
      height: window.innerHeight,
    }
  })

  expect(controls.top).toBeGreaterThanOrEqual(safeArea.top)
  expect(controls.bottom).toBeLessThanOrEqual(controls.height - safeArea.bottom)
})

test('Mobile Safari показывает режим поста без горизонтального переполнения на узком экране', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('./')
  await choosePlace(page)
  await page.locator('#home-settings').click()
  const fastingMode = page.getByRole('switch', { name: 'Режим поста' })
  await expect(fastingMode).toHaveAttribute('aria-checked', 'false')
  await fastingMode.click()
  await expect(fastingMode).toHaveAttribute('aria-checked', 'true')
  await expect.poll(() => readSavedSetting(page, 'fastingMode')).toMatchObject({ manualEnabled: true })
  await page.getByRole('button', { name: 'Назад', exact: true }).click()

  const card = page.locator('.fasting-card')
  await expect(card).toBeVisible()
  await expect(card.getByText('Пост', { exact: true })).toBeVisible()
  await expect(card.getByRole('progressbar')).toHaveAccessibleName('Прогресс дневного поста')
  const readCardSurface = () => card.evaluate(element => {
    const probe = document.createElement('span')
    probe.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--background-tertiary')
    document.body.append(probe)
    const token = getComputedStyle(probe).backgroundColor
    probe.remove()
    return { background: getComputedStyle(element).backgroundColor, token }
  })
  expect(await readCardSurface().then(({ background, token }) => background === token)).toBe(true)

  await page.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.themeTone)).toBe('dark')
  expect(await readCardSurface().then(({ background, token }) => background === token)).toBe(true)
  await page.emulateMedia({ colorScheme: 'light' })
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.themeTone)).toBe('light')

  await page.locator('#home-settings').click()
  await page.getByRole('combobox', { name: 'Тема' }).selectOption('seasonal')
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('seasonal')
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.themeTone)).toBe('light')
  await page.getByRole('button', { name: 'Назад', exact: true }).click()
  await expect(card).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.dataset.season)).toBe('autumn')
  expect(await readCardSurface().then(({ background, token }) => background === token)).toBe(true)

  await page.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.themeTone)).toBe('dark')
  expect(await readCardSurface().then(({ background, token }) => background === token)).toBe(true)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  const reducedMotion = await card.evaluate(element => ({
    enabled: matchMedia('(prefers-reduced-motion: reduce)').matches,
    progressTransition: getComputedStyle(element.querySelector('.fasting-progress-fill') as Element).transitionDuration,
  }))
  expect(reducedMotion).toEqual({ enabled: true, progressTransition: '0s' })

  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 720 }]) {
    await page.setViewportSize(viewport)
    const layout = await page.evaluate(() => {
      const cardElement = document.querySelector('.fasting-card')
      const heading = cardElement?.querySelector('.fasting-card-heading')
      const title = heading?.querySelector('span:first-child')
      const duration = heading?.querySelector('.fasting-duration')
      const endpoints = [...document.querySelectorAll('.fasting-endpoint')]
      if (!cardElement || !heading || !title || !duration || endpoints.length !== 2) throw new Error('Не найдены карточка поста, длительность или её времена')
      const headingBounds = heading.getBoundingClientRect()
      const titleBounds = title.getBoundingClientRect()
      const durationBounds = duration.getBoundingClientRect()
      return {
        viewportWidth: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        cardRight: cardElement.getBoundingClientRect().right,
        headingJustification: getComputedStyle(heading).justifyContent,
        titleLeft: titleBounds.left,
        headingLeft: headingBounds.left,
        titleTop: titleBounds.top,
        titleBottom: titleBounds.bottom,
        durationLeft: durationBounds.left,
        durationTop: durationBounds.top,
        durationBottom: durationBounds.bottom,
        titleRight: titleBounds.right,
        endpointTops: endpoints.map(endpoint => endpoint.getBoundingClientRect().top),
      }
    })
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1)
    expect(layout.cardRight).toBeLessThanOrEqual(layout.viewportWidth)
    expect(layout.headingJustification).toBe('flex-start')
    expect(layout.titleLeft).toBe(layout.headingLeft)
    expect(layout.durationLeft).toBeGreaterThanOrEqual(layout.titleRight)
    expect(layout.durationTop).toBeLessThan(layout.titleBottom)
    expect(layout.durationBottom).toBeGreaterThan(layout.titleTop)
    expect(layout.endpointTops[0]).toBe(layout.endpointTops[1])
  }
})
