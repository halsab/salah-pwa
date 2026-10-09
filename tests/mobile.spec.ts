import { choosePlace, expectSchedule, expect, test } from './fixtures'

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
  const city = page.getByRole('button', { name: 'Москва, Москва, Россия', exact: true })
  await expect(city).toBeVisible()

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
  const withinVisualViewport = await city.evaluate(element => {
    const bounds = element.getBoundingClientRect()
    const viewport = window.visualViewport
    if (!viewport) return false
    return bounds.top >= viewport.offsetTop
      && bounds.bottom <= viewport.offsetTop + viewport.height
  })
  expect(withinVisualViewport).toBe(true)
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
