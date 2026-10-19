import { choosePlace, expect, expectSchedule, test } from './fixtures'

async function readShellGeometry(region: import('@playwright/test').Locator) {
  return region.evaluate(element => {
    const shell = document.querySelector<HTMLElement>('.app-layout')
    const panel = element.querySelector<HTMLElement>(':scope > .screen-panel')
    const top = element.querySelector<HTMLElement>(':scope > .screen-top')
    const content = panel?.querySelector<HTMLElement>(':scope > .screen-content')
    const footer = panel?.querySelector<HTMLElement>(':scope > .screen-bottom')
    if (!shell || !panel || !content) throw new Error('Не найдена общая структура Screen')
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
      topBackgroundAlpha: topColor?.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([^)]+)\)/)?.[1] ?? null,
      panelBackgroundMatchesToken: getComputedStyle(panel).backgroundColor === panelToken,
      shellBackground: getComputedStyle(shell).backgroundColor,
      documentBackground: getComputedStyle(document.body).backgroundColor,
      primaryBackground,
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
      footerTop: footerBounds?.top ?? null,
      footerBottom: footerActionBottom,
      footerRegionBottom: footerBounds?.bottom ?? null,
      footerPaddingBottom: footer ? parseFloat(getComputedStyle(footer).paddingBottom) : null,
      bottomSafeArea,
      contentPaddingBottom: parseFloat(getComputedStyle(content).paddingBottom),
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

  const onboarding = page.getByRole('region', { name: 'Выберите место', exact: true })
  await expect(onboarding).toBeVisible()
  const onboardingGeometry = await readShellGeometry(onboarding)
  expect(onboardingGeometry.topIsBeforePanel).toBe(false)
  expect(onboardingGeometry.footerIsInPanel).toBe(true)
  expect(onboardingGeometry.panelBottom).toBeCloseTo(onboardingGeometry.shellBottom, 0)
  expect(onboardingGeometry.panelTop).toBeCloseTo(onboardingGeometry.shellTop + onboardingGeometry.shellPaddingTop, 0)
  expect(onboardingGeometry.bottomSafeArea).toBeGreaterThanOrEqual(0)
  expect(onboardingGeometry.footerBottom).toBeLessThanOrEqual(onboardingGeometry.panelBottom - Math.max(16, onboardingGeometry.bottomSafeArea) + 1)

  await choosePlace(page)
  await expectSchedule(page)
  const home = page.getByRole('region', { name: 'Главная', exact: true })
  const homeGeometry = await readShellGeometry(home)
  expect(homeGeometry.topIsBeforePanel).toBe(true)
  expect(homeGeometry.panelIsInRegion).toBe(true)
  expect(homeGeometry.contentIsInPanel).toBe(true)
  expect(homeGeometry.footerIsInPanel).toBe(true)
  expect(homeGeometry.topBackgroundAlpha).toBe('0')
  expect(homeGeometry.panelBackgroundMatchesToken).toBe(true)
  expect(homeGeometry.topLeftRadius).toBe('38px')
  expect(homeGeometry.topRightRadius).toBe('38px')
  expect(homeGeometry.bottomLeftRadius).toBe('0px')
  expect(homeGeometry.bottomRightRadius).toBe('0px')
  expect(homeGeometry.panelBottom).toBeCloseTo(homeGeometry.shellBottom, 0)
  expect(homeGeometry.shellBackground).toBe(homeGeometry.primaryBackground)
  expect(homeGeometry.documentBackground).toBe(homeGeometry.primaryBackground)
  expect(homeGeometry.scrollRegionCount).toBe(1)
  expect(homeGeometry.documentWidth).toBeLessThanOrEqual(homeGeometry.viewportWidth + 1)
  expect(homeGeometry.contentScrollHeight).toBeGreaterThan(homeGeometry.contentClientHeight)

  const originalLabels = await page.evaluate(() => {
    const place = document.querySelector<HTMLElement>('.home-location-name')
    const date = document.querySelector<HTMLElement>('#home-date time')
    if (!place || !date) throw new Error('Не найдены кнопки места и даты')
    const saved = [place.textContent, date.textContent]
    place.textContent = 'Очень длинное название выбранного места для проверки переноса'
    date.textContent = 'Пятница, двадцать первое сентября две тысячи двадцать шестого года'
    return saved
  })
  const longLabelBounds = await page.evaluate(() => {
    const place = document.querySelector<HTMLElement>('#home-location')
    const date = document.querySelector<HTMLElement>('#home-date')
    const header = document.querySelector<HTMLElement>('.screen-top')
    if (!place || !date || !header) throw new Error('Не найдены верхние действия')
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      placeRight: place.getBoundingClientRect().right,
      dateRight: date.getBoundingClientRect().right,
      placeHeight: place.getBoundingClientRect().height,
      dateHeight: date.getBoundingClientRect().height,
      headerHeight: header.getBoundingClientRect().height,
    }
  })
  expect(longLabelBounds.documentWidth).toBeLessThanOrEqual(longLabelBounds.viewportWidth + 1)
  expect(longLabelBounds.placeRight).toBeLessThanOrEqual(longLabelBounds.viewportWidth)
  expect(longLabelBounds.dateRight).toBeLessThanOrEqual(longLabelBounds.viewportWidth)
  expect(longLabelBounds.placeHeight).toBeGreaterThanOrEqual(44)
  expect(longLabelBounds.dateHeight).toBeGreaterThanOrEqual(44)
  expect(longLabelBounds.headerHeight).toBeGreaterThan(44)
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
  expect(dateGeometry.contentPaddingBottom).toBeGreaterThanOrEqual(16)
  expect(dateGeometry.panelBottom).toBeCloseTo(dateGeometry.shellBottom, 0)

  const day = date.getByRole('combobox', { name: 'День' })
  const currentDay = Number(await day.inputValue())
  await day.selectOption(String(currentDay + 1))
  await expect(date.locator('.screen-bottom')).toBeVisible()
  await expect(date.getByRole('button', { name: 'Сегодня' })).toBeVisible()
  const alternateDateGeometry = await readShellGeometry(date)
  expect(alternateDateGeometry.contentClientHeight).toBeLessThan(dateGeometry.contentClientHeight)
  expect(alternateDateGeometry.panelBottom).toBeCloseTo(dateGeometry.panelBottom, 0)
  await date.getByRole('button', { name: 'Сегодня' }).click()
  await expect(date.locator('.screen-bottom')).toHaveCount(0)
  await expect(day).toHaveValue(String(currentDay))

  await date.getByRole('button', { name: 'Праздники и события' }).click()
  const events = page.getByRole('region', { name: 'Праздники и события', exact: true })
  await expect(events).toBeVisible()
  const eventsGeometry = await readShellGeometry(events)
  expect(eventsGeometry.footerBottom).toBeNull()
  expect(eventsGeometry.contentPaddingBottom).toBeGreaterThanOrEqual(16)
  expect(eventsGeometry.contentScrollHeight).toBeGreaterThan(eventsGeometry.contentClientHeight)
  await events.locator('.screen-content').evaluate(element => { element.scrollTop = element.scrollHeight })
  await expect.poll(() => events.locator('.screen-content').evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  const scrolledEvents = await readShellGeometry(events)
  expect(scrolledEvents.headerTop).toBe(eventsGeometry.headerTop)
  expect(scrolledEvents.documentScrollTop).toBe(0)
  expect(scrolledEvents.scrollRegionCount).toBe(1)
  expect(scrolledEvents.documentWidth).toBeLessThanOrEqual(scrolledEvents.viewportWidth + 1)

  await events.locator('.screen-content').evaluate(element => { element.scrollTop = 0 })
  const article = events.locator('.religious-events-list').getByRole('button').first()
  await article.click()
  await expect(page.getByRole('button', { name: 'Назад', exact: true })).toBeVisible()
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
  await page.getByRole('combobox', { name: 'Тема' }).selectOption('seasonal')
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('seasonal')
  await page.getByRole('button', { name: 'Назад', exact: true }).click()
  const autumnGeometry = await readShellGeometry(home)
  expect(await page.locator('html').getAttribute('data-season')).toBe('autumn')
  expect(autumnGeometry.primaryBackground).not.toBe('rgb(0, 0, 0)')
  expect(autumnGeometry.shellBackground).toBe(autumnGeometry.primaryBackground)
  expect(autumnGeometry.documentBackground).toBe(autumnGeometry.primaryBackground)

  await page.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(() => page.locator('html').getAttribute('data-theme-tone')).toBe('dark')
  const autumnDarkGeometry = await readShellGeometry(home)
  expect(autumnDarkGeometry.primaryBackground).toBe('rgb(110, 81, 70)')
  expect(autumnDarkGeometry.shellBackground).toBe(autumnDarkGeometry.primaryBackground)
  expect(autumnDarkGeometry.documentBackground).toBe(autumnDarkGeometry.primaryBackground)

  await page.emulateMedia({ colorScheme: 'light' })
  await expect.poll(() => page.locator('html').getAttribute('data-theme-tone')).toBe('light')
  const autumnLightGeometry = await readShellGeometry(home)
  expect(autumnLightGeometry.primaryBackground).toBe('rgb(214, 178, 155)')
  expect(autumnLightGeometry.shellBackground).toBe(autumnLightGeometry.primaryBackground)
  expect(autumnLightGeometry.documentBackground).toBe(autumnLightGeometry.primaryBackground)
})
