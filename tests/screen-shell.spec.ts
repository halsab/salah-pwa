import { choosePlace, expect, expectSchedule, test } from './fixtures'

async function readShellGeometry(region: import('@playwright/test').Locator) {
  return region.evaluate(element => {
    const shell = document.querySelector<HTMLElement>('.app-layout')
    const panel = element.querySelector<HTMLElement>(':scope > .screen-panel')
    const top = element.querySelector<HTMLElement>(':scope > .screen-top')
    const content = panel?.querySelector<HTMLElement>(':scope > .screen-content')
    const footer = panel?.querySelector<HTMLElement>(':scope > .screen-bottom')
    const surface = document.querySelector<HTMLElement>('.app-bottom-surface')
    if (!shell || !panel || !content || !surface) throw new Error('Не найдена общая структура Screen')
    const panelBounds = panel.getBoundingClientRect()
    const shellBounds = shell.getBoundingClientRect()
    const topBounds = top?.getBoundingClientRect()
    const footerBounds = footer?.getBoundingClientRect()
    const footerActionBottom = footer
      ? Math.max(...Array.from(footer.querySelectorAll<HTMLElement>('button'), button => button.getBoundingClientRect().bottom))
      : null
    const topColor = top ? getComputedStyle(top).backgroundColor : null
    const panelProbe = document.createElement('span')
    panelProbe.style.backgroundColor = 'var(--background-secondary)'
    document.body.append(panelProbe)
    const panelToken = getComputedStyle(panelProbe).backgroundColor
    panelProbe.remove()
    const primaryProbe = document.createElement('span')
    primaryProbe.style.backgroundColor = 'var(--background-primary)'
    document.body.append(primaryProbe)
    const primaryBackground = getComputedStyle(primaryProbe).backgroundColor
    primaryProbe.remove()
    const safeAreaProbe = document.createElement('span')
    safeAreaProbe.style.cssText = 'position:fixed;padding-bottom:env(safe-area-inset-bottom, 0px)'
    document.body.append(safeAreaProbe)
    const bottomSafeArea = parseFloat(getComputedStyle(safeAreaProbe).paddingBottom)
    safeAreaProbe.remove()
    return {
      topIsBeforePanel: top?.parentElement === element && top.nextElementSibling === panel,
      panelIsInRegion: panel.parentElement === element,
      contentIsInPanel: content.parentElement === panel,
      footerIsInPanel: footer === null || footer.parentElement === panel,
      contentTop: content.getBoundingClientRect().top,
      contentBottom: content.getBoundingClientRect().bottom,
      topBackgroundAlpha: topColor?.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([^)]+)\)/)?.[1] ?? null,
      panelBackgroundMatchesToken: getComputedStyle(panel).backgroundColor === panelToken,
      shellBackground: getComputedStyle(shell).backgroundColor,
      documentBackground: getComputedStyle(document.body).backgroundColor,
      primaryBackground,
      bottomSurface: {
        backgroundMatchesPanel: getComputedStyle(surface).backgroundColor === panelToken,
        position: getComputedStyle(surface).position,
        pointerEvents: getComputedStyle(surface).pointerEvents,
        hiddenFromAccessibility: surface.getAttribute('aria-hidden'),
        outsideShell: !shell.contains(surface),
        height: surface.getBoundingClientRect().height,
        bottom: surface.getBoundingClientRect().bottom,
        width: surface.getBoundingClientRect().width,
        interceptsPointer: document.elementFromPoint(innerWidth / 2, innerHeight - 8) === surface,
      },
      topLeftRadius: getComputedStyle(panel).borderTopLeftRadius,
      topRightRadius: getComputedStyle(panel).borderTopRightRadius,
      bottomLeftRadius: getComputedStyle(panel).borderBottomLeftRadius,
      bottomRightRadius: getComputedStyle(panel).borderBottomRightRadius,
      headerTop: topBounds?.top ?? null,
      headerBottom: topBounds?.bottom ?? null,
      panelTop: panelBounds.top,
      panelBottom: panelBounds.bottom,
      shellTop: shellBounds.top,
      shellBottom: shellBounds.bottom,
      shellPaddingTop: parseFloat(getComputedStyle(shell).paddingTop),
      screenPaddingTop: parseFloat(getComputedStyle(element).paddingTop),
      screenGap: parseFloat(getComputedStyle(element).rowGap),
      topPaddingLeft: top ? parseFloat(getComputedStyle(top).paddingLeft) : null,
      topPaddingRight: top ? parseFloat(getComputedStyle(top).paddingRight) : null,
      footerTop: footerBounds?.top ?? null,
      footerBottom: footerActionBottom,
      footerRegionBottom: footerBounds?.bottom ?? null,
      footerPaddingBottom: footer ? parseFloat(getComputedStyle(footer).paddingBottom) : null,
      bottomSafeArea,
      contentPaddingBottom: parseFloat(getComputedStyle(content).paddingBottom),
      contentPaddingTop: parseFloat(getComputedStyle(content).paddingTop),
      contentScrollHeight: content.scrollHeight,
      contentClientHeight: content.clientHeight,
      contentScrollTop: content.scrollTop,
      documentScrollTop: document.scrollingElement?.scrollTop ?? 0,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      scrollRegionCount: element.querySelectorAll('.screen-content').length,
      contentTransitionName: getComputedStyle(content).viewTransitionName,
    }
  })
}

test('общая оболочка держит слоты, прокрутку и фокус на всех экранах', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 560 })
  await page.goto('./')
  const setTopSafeArea = (value: number | null) => page.locator('.app-layout').evaluate((element, inset) => {
    const shell = element as HTMLElement
    if (inset === null) shell.style.removeProperty('--app-safe-area-top')
    else shell.style.setProperty('--app-safe-area-top', `${inset}px`)
  }, value)

  const onboarding = page.getByRole('region', { name: 'Выберите место', exact: true })
  await expect(onboarding).toBeVisible()
  const onboardingGeometry = await readShellGeometry(onboarding)
  expect(onboardingGeometry.topIsBeforePanel).toBe(false)
  expect(onboardingGeometry.footerIsInPanel).toBe(true)
  expect(onboardingGeometry.panelBottom).toBeCloseTo(onboardingGeometry.shellBottom, 0)
  expect(onboardingGeometry.panelTop).toBeCloseTo(onboardingGeometry.shellTop + onboardingGeometry.shellPaddingTop, 0)
  expect(onboardingGeometry.contentTop).toBeCloseTo(onboardingGeometry.panelTop, 0)
  expect(onboardingGeometry.contentPaddingTop).toBe(16)
  expect(onboardingGeometry.bottomSafeArea).toBeGreaterThanOrEqual(0)
  expect(onboardingGeometry.footerBottom).toBeLessThanOrEqual(onboardingGeometry.panelBottom - Math.max(16, onboardingGeometry.bottomSafeArea) + 1)
  for (const safeArea of [0, 1, 59, 0]) {
    await setTopSafeArea(safeArea)
    const geometry = await readShellGeometry(onboarding)
    expect(geometry.shellPaddingTop).toBe(safeArea)
    expect(geometry.screenPaddingTop).toBe(0)
    expect(geometry.panelTop).toBeCloseTo(geometry.shellTop + safeArea, 0)
    expect(geometry.panelBottom).toBe(onboardingGeometry.panelBottom)
  }
  await setTopSafeArea(null)

  await choosePlace(page)
  await expectSchedule(page)
  await page.setViewportSize({ width: 320, height: 420 })
  const home = page.getByRole('region', { name: 'Главная', exact: true })
  const homeGeometry = await readShellGeometry(home)
  expect(homeGeometry.topIsBeforePanel).toBe(true)
  expect(homeGeometry.panelIsInRegion).toBe(true)
  expect(homeGeometry.contentIsInPanel).toBe(true)
  expect(homeGeometry.footerIsInPanel).toBe(true)
  expect(homeGeometry.topBackgroundAlpha).toBe('0')
  expect(homeGeometry.screenPaddingTop).toBe(8)
  expect(homeGeometry.screenGap).toBe(8)
  expect(homeGeometry.topPaddingLeft).toBe(8)
  expect(homeGeometry.topPaddingRight).toBe(8)
  expect(homeGeometry.panelTop).toBeCloseTo((homeGeometry.headerBottom ?? 0) + 8, 0)
  expect(homeGeometry.contentTop).toBeCloseTo(homeGeometry.panelTop, 0)
  expect(homeGeometry.contentBottom).toBeCloseTo(homeGeometry.footerTop ?? 0, 0)
  expect(homeGeometry.contentPaddingTop).toBe(0)
  expect(homeGeometry.contentPaddingBottom).toBeGreaterThanOrEqual(16)
  expect(homeGeometry.panelBackgroundMatchesToken).toBe(true)
  expect(homeGeometry.topLeftRadius).toBe('38px')
  expect(homeGeometry.topRightRadius).toBe('38px')
  expect(homeGeometry.bottomLeftRadius).toBe('0px')
  expect(homeGeometry.bottomRightRadius).toBe('0px')
  expect(homeGeometry.panelBottom).toBeCloseTo(homeGeometry.shellBottom, 0)
  expect(homeGeometry.shellBackground).toBe(homeGeometry.primaryBackground)
  expect(homeGeometry.documentBackground).toBe(homeGeometry.primaryBackground)
  expect(homeGeometry.bottomSurface).toMatchObject({ backgroundMatchesPanel: true, position: 'fixed', pointerEvents: 'none', hiddenFromAccessibility: 'true', outsideShell: true, height: 16, interceptsPointer: false })
  expect(homeGeometry.bottomSurface.bottom).toBeCloseTo(homeGeometry.shellBottom, 0)
  expect(homeGeometry.bottomSurface.width).toBe(homeGeometry.viewportWidth)
  expect(homeGeometry.footerBottom).toBeLessThanOrEqual(homeGeometry.bottomSurface.bottom - 16 + 1)
  expect(homeGeometry.scrollRegionCount).toBe(1)
  expect(homeGeometry.documentWidth).toBeLessThanOrEqual(homeGeometry.viewportWidth + 1)
  expect(homeGeometry.contentScrollHeight).toBeGreaterThan(homeGeometry.contentClientHeight)
  const firstPrayerTop = await home.locator('.event-list > .event-row').first().evaluate(element => element.getBoundingClientRect().top)
  expect(firstPrayerTop).toBeCloseTo(homeGeometry.panelTop, 0)

  for (const safeArea of [0, 1, 59, 0]) {
    await setTopSafeArea(safeArea)
    const geometry = await readShellGeometry(home)
    const extraTop = safeArea > 0 ? 0 : 8
    expect(geometry.shellPaddingTop).toBe(safeArea)
    expect(geometry.screenPaddingTop).toBe(extraTop)
    expect(geometry.headerTop).toBeCloseTo(geometry.shellTop + safeArea + extraTop, 0)
    expect(geometry.panelTop).toBeCloseTo((geometry.headerBottom ?? 0) + 8, 0)
    expect(geometry.topPaddingLeft).toBe(8)
    expect(geometry.topPaddingRight).toBe(8)
    expect(geometry.footerBottom).toBe(homeGeometry.footerBottom)
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1)
    if (safeArea === 59) {
      await page.locator('#home-date').click()
      const nested = page.getByRole('region', { name: 'Установка даты', exact: true })
      await expect(nested).toBeVisible()
      const nestedGeometry = await readShellGeometry(nested)
      expect(nestedGeometry.screenPaddingTop).toBe(0)
      expect(nestedGeometry.headerTop).toBeCloseTo(nestedGeometry.shellTop + safeArea, 0)
      await nested.getByRole('button', { name: 'Назад', exact: true }).click()
      await expect(home).toBeVisible()
    }
  }
  await setTopSafeArea(null)

  const originalViewport = page.viewportSize()
  for (const colorScheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme })
    await expect.poll(() => page.locator('html').getAttribute('data-theme-tone')).toBe(colorScheme)
    const classicGeometry = await readShellGeometry(home)
    expect(classicGeometry.documentBackground).toBe(classicGeometry.primaryBackground)
    expect(classicGeometry.shellBackground).toBe(classicGeometry.primaryBackground)
    expect(classicGeometry.bottomSurface.backgroundMatchesPanel).toBe(true)
    expect(classicGeometry.footerBottom).toBe(homeGeometry.footerBottom)
    expect(classicGeometry.panelTop).toBe(homeGeometry.panelTop)
  }

  const originalLabels = await page.evaluate(() => {
    const place = document.querySelector<HTMLElement>('.home-location-name')
    const date = document.querySelector<HTMLElement>('#home-date time')
    if (!place || !date) throw new Error('Не найдены кнопки места и даты')
    const saved = [place.textContent, date.textContent]
    place.textContent = 'Очень длинное название выбранного места для проверки переноса'
    return saved
  })
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    for (const colorScheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme })
      for (const month of ['раби авв.', 'раби ахир', 'джум. уля', 'джум. ах.', '15 рамадан']) {
        await page.locator('#home-date time').evaluate((element, label) => { element.textContent = label }, `8 ${month}`)
        const bounds = await page.evaluate(() => {
          const place = document.querySelector<HTMLElement>('#home-location')
          const placeName = document.querySelector<HTMLElement>('.home-location-name')
          const date = document.querySelector<HTMLElement>('#home-date')
          const time = document.querySelector<HTMLElement>('#home-date time')
          const header = document.querySelector<HTMLElement>('.screen-top')
          if (!place || !placeName || !date || !time || !header) throw new Error('Не найдены верхние действия')
          const range = document.createRange()
          range.selectNodeContents(time)
          const textBounds = range.getBoundingClientRect()
          return {
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
            placeLeft: place.getBoundingClientRect().left,
            placeRight: place.getBoundingClientRect().right,
            dateLeft: date.getBoundingClientRect().left,
            dateRight: date.getBoundingClientRect().right,
            textRight: textBounds.right,
            placeHeight: place.getBoundingClientRect().height,
            dateHeight: date.getBoundingClientRect().height,
            headerHeight: header.getBoundingClientRect().height,
            placeTextOverflows: placeName.scrollWidth > placeName.clientWidth,
          }
        })
        expect(bounds.documentWidth).toBeLessThanOrEqual(width + 1)
        expect(bounds.placeLeft).toBeGreaterThanOrEqual(0)
        expect(bounds.dateRight).toBeLessThanOrEqual(width)
        expect(bounds.dateLeft).toBeGreaterThanOrEqual(bounds.placeRight)
        expect(bounds.textRight).toBeLessThanOrEqual(bounds.dateRight - 8)
        expect(bounds.placeHeight).toBe(44)
        expect(bounds.dateHeight).toBe(44)
        expect(bounds.headerHeight).toBe(44)
        expect(bounds.placeTextOverflows).toBe(true)
        await expect(page.locator('#home-date')).toBeVisible()
        await expect(page.locator('#home-location')).toBeVisible()
      }
    }
  }
  if (originalViewport) await page.setViewportSize(originalViewport)
  await page.evaluate(([placeLabel, dateLabel]) => {
    const place = document.querySelector<HTMLElement>('.home-location-name')
    const date = document.querySelector<HTMLElement>('#home-date time')
    if (!place || !date) throw new Error('Не найдены верхние подписи для восстановления')
    place.textContent = placeLabel
    date.textContent = dateLabel
  }, originalLabels)

  await page.locator('.screen-content').evaluate(element => { element.scrollTop = element.scrollHeight })
  await expect.poll(() => page.locator('.screen-content').evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  const scrolledHome = await readShellGeometry(home)
  expect(scrolledHome.headerTop).toBe(homeGeometry.headerTop)
  expect(scrolledHome.footerTop).toBe(homeGeometry.footerTop)
  expect(scrolledHome.documentScrollTop).toBe(0)
  const lastContentBottom = await home.locator('.screen-content').evaluate(element => element.lastElementChild?.getBoundingClientRect().bottom ?? 0)
  expect(lastContentBottom).toBeLessThanOrEqual((scrolledHome.footerTop ?? 0) - 15)

  await page.setViewportSize({ width: 844, height: 390 })
  const landscapeGeometry = await readShellGeometry(home)
  expect(landscapeGeometry.panelBottom).toBeCloseTo(landscapeGeometry.shellBottom, 0)
  expect(landscapeGeometry.documentWidth).toBeLessThanOrEqual(landscapeGeometry.viewportWidth + 1)

  const homeDate = page.locator('#home-date')
  await homeDate.click()
  const date = page.getByRole('region', { name: 'Установка даты', exact: true })
  await expect(date).toBeVisible()
  const dateGeometry = await readShellGeometry(date)
  expect(dateGeometry.footerBottom).toBeNull()
  expect(dateGeometry.contentTop).toBeCloseTo(dateGeometry.panelTop, 0)
  expect(dateGeometry.contentBottom).toBeCloseTo(dateGeometry.panelBottom, 0)
  expect(dateGeometry.contentPaddingTop).toBe(16)
  expect(dateGeometry.contentPaddingBottom).toBeGreaterThanOrEqual(16)
  expect(dateGeometry.panelBottom).toBeCloseTo(dateGeometry.shellBottom, 0)

  const day = date.getByRole('combobox', { name: 'День' })
  const currentDay = Number(await day.inputValue())
  await day.selectOption(String(currentDay + 1))
  await expect(date.locator('.screen-bottom')).toBeVisible()
  await expect(date.getByRole('button', { name: 'Сегодня' })).toBeVisible()
  const alternateDateGeometry = await readShellGeometry(date)
  expect(alternateDateGeometry.contentClientHeight).toBeLessThan(dateGeometry.contentClientHeight)
  expect(alternateDateGeometry.contentBottom).toBeCloseTo(alternateDateGeometry.footerTop ?? 0, 0)
  expect(alternateDateGeometry.contentPaddingBottom).toBeGreaterThanOrEqual(16)
  expect(alternateDateGeometry.panelBottom).toBeCloseTo(dateGeometry.panelBottom, 0)
  await date.getByRole('button', { name: 'Сегодня' }).click()
  await expect(date.locator('.screen-bottom')).toHaveCount(0)
  await expect(day).toHaveValue(String(currentDay))

  await date.getByRole('button', { name: 'Праздники и события' }).click()
  const events = page.getByRole('region', { name: 'Праздники и события', exact: true })
  await expect(events).toBeVisible()
  const eventsGeometry = await readShellGeometry(events)
  expect(eventsGeometry.footerBottom).toBeNull()
  expect(eventsGeometry.contentTop).toBeCloseTo(eventsGeometry.panelTop, 0)
  expect(eventsGeometry.contentBottom).toBeCloseTo(eventsGeometry.panelBottom, 0)
  expect(eventsGeometry.contentPaddingTop).toBe(16)
  expect(eventsGeometry.contentPaddingBottom).toBeGreaterThanOrEqual(16)
  expect(eventsGeometry.contentScrollHeight).toBeGreaterThan(eventsGeometry.contentClientHeight)
  const firstReligiousEventTop = await events.locator('.religious-events-list > li').first().evaluate(element => element.getBoundingClientRect().top)
  expect(firstReligiousEventTop).toBeCloseTo(eventsGeometry.panelTop + 16, 0)
  await events.locator('.screen-content').evaluate(element => { element.scrollTop = element.scrollHeight })
  await expect.poll(() => events.locator('.screen-content').evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  const scrolledEvents = await readShellGeometry(events)
  expect(scrolledEvents.headerTop).toBe(eventsGeometry.headerTop)
  expect(scrolledEvents.documentScrollTop).toBe(0)
  expect(scrolledEvents.scrollRegionCount).toBe(1)
  expect(scrolledEvents.documentWidth).toBeLessThanOrEqual(scrolledEvents.viewportWidth + 1)
  const lastReligiousEventBottom = await events.locator('.religious-events-list > li').last().evaluate(element => element.getBoundingClientRect().bottom)
  expect(lastReligiousEventBottom).toBeLessThanOrEqual(eventsGeometry.panelBottom - 15)

  await events.locator('.screen-content').evaluate(element => { element.scrollTop = 0 })
  const article = events.locator('.religious-events-list').getByRole('button').first()
  await article.click()
  await expect(page.getByRole('button', { name: 'Назад', exact: true })).toBeVisible()
  const articleScreen = page.getByRole('region').filter({ has: page.locator('.markdown-article') })
  const articleGeometry = await readShellGeometry(articleScreen)
  expect(articleGeometry.contentTop).toBeCloseTo(articleGeometry.panelTop, 0)
  expect(articleGeometry.contentPaddingTop).toBe(16)
  expect(articleGeometry.contentPaddingBottom).toBeGreaterThanOrEqual(16)
  await page.getByRole('button', { name: 'Назад', exact: true }).click()
  await expect(article).toBeFocused()

  await page.getByRole('button', { name: 'Назад', exact: true }).click()
  await expect(date).toBeVisible()
  await page.getByRole('button', { name: 'Назад', exact: true }).click()
  await expect(homeDate).toBeFocused()
  const wideGeometry = await readShellGeometry(home)
  expect(wideGeometry.topLeftRadius).toBe('38px')
  expect(wideGeometry.bottomLeftRadius).toBe('0px')

  await page.locator('#home-settings').click()
  const settings = page.getByRole('region', { name: 'Настройки', exact: true })
  await expect(settings).toBeVisible()
  const settingsGeometry = await readShellGeometry(settings)
  expect(settingsGeometry.contentTop).toBeCloseTo(settingsGeometry.panelTop, 0)
  expect(settingsGeometry.contentBottom).toBeCloseTo(settingsGeometry.footerTop ?? 0, 0)
  expect(settingsGeometry.contentPaddingTop).toBe(16)
  expect(settingsGeometry.contentPaddingBottom).toBeGreaterThanOrEqual(16)
  await page.getByRole('combobox', { name: 'Тема' }).selectOption('seasonal')
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('seasonal')
  await page.getByRole('button', { name: 'Назад', exact: true }).click()
  const autumnGeometry = await readShellGeometry(home)
  expect(await page.locator('html').getAttribute('data-season')).toBe('autumn')
  expect(autumnGeometry.primaryBackground).not.toBe('rgb(0, 0, 0)')
  expect(autumnGeometry.shellBackground).toBe(autumnGeometry.primaryBackground)
  expect(autumnGeometry.documentBackground).toBe(autumnGeometry.primaryBackground)
  expect(autumnGeometry.bottomSurface.backgroundMatchesPanel).toBe(true)

  await page.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(() => page.locator('html').getAttribute('data-theme-tone')).toBe('dark')
  const autumnDarkGeometry = await readShellGeometry(home)
  expect(autumnDarkGeometry.primaryBackground).toBe('rgb(110, 81, 70)')
  expect(autumnDarkGeometry.shellBackground).toBe(autumnDarkGeometry.primaryBackground)
  expect(autumnDarkGeometry.documentBackground).toBe(autumnDarkGeometry.primaryBackground)
  expect(autumnDarkGeometry.bottomSurface.backgroundMatchesPanel).toBe(true)

  await page.emulateMedia({ colorScheme: 'light' })
  await expect.poll(() => page.locator('html').getAttribute('data-theme-tone')).toBe('light')
  const autumnLightGeometry = await readShellGeometry(home)
  expect(autumnLightGeometry.primaryBackground).toBe('rgb(214, 178, 155)')
  expect(autumnLightGeometry.shellBackground).toBe(autumnLightGeometry.primaryBackground)
  expect(autumnLightGeometry.documentBackground).toBe(autumnLightGeometry.primaryBackground)
  expect(autumnLightGeometry.bottomSurface.backgroundMatchesPanel).toBe(true)
})
