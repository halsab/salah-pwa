import { choosePlace, expect, expectSchedule, test } from './fixtures'

const compactMonths = [
  { month: '3', day: '12', compact: '12 раби авв.', full: /^12 раби аль-авваль \d{4}$/ },
  { month: '4', day: '12', compact: '12 раби ахир', full: /^12 раби аль-ахир \d{4}$/ },
  { month: '5', day: '12', compact: '12 джум. уля', full: /^12 джумада аль-уля \d{4}$/ },
  { month: '6', day: '12', compact: '12 джум. ах.', full: /^12 джумада аль-ахира \d{4}$/ },
  { month: '9', day: '15', compact: '15 рамадан', full: /^15 рамадан \d{4}$/ },
]

test('header Hijri labels stay readable and accessible in real location and calendar states', async ({ page }, testInfo) => {
  await page.goto('./')
  await choosePlace(page)
  await expectSchedule(page)

  await page.locator('#home-location').click()
  await page.getByRole('button', { name: 'Найти город', exact: true }).click()
  await page.getByRole('searchbox').fill('Дехивала-Маунт-Лавиния')
  const longLocation = page.getByRole('button', { name: /Дехивала-Маунт-Лавиния/ })
  await expect(longLocation).toBeVisible()
  await longLocation.click()
  await expect(page.getByRole('region', { name: 'Главная', exact: true })).toBeVisible()
  await expect(page.locator('#home-location')).toContainText('Дехивала-Маунт-Лавиния')
  await expect(page.locator('#home-location')).toContainText(/\d{2}:\d{2}/)

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme })
      await expect.poll(() => page.locator('html').getAttribute('data-theme-tone')).toBe(colorScheme)

      for (const { month, day, compact, full } of compactMonths) {
        await page.locator('#home-date').click()
        const calendar = page.getByRole('combobox', { name: 'Календарь' })
        await calendar.selectOption('hijri')
        await page.getByRole('combobox', { name: 'Месяц' }).selectOption(month)
        await page.getByRole('combobox', { name: 'День' }).selectOption(day)
        await page.getByRole('button', { name: 'Назад', exact: true }).click()

        const homeDate = page.locator('#home-date')
        await expect(homeDate.locator('time')).toHaveText(compact)
        await expect(page.locator('#home-date-description')).toHaveText(full)
        await expect(homeDate).toHaveAttribute('aria-describedby', 'home-date-description')

        const layout = await page.evaluate(() => {
          const location = document.querySelector<HTMLElement>('#home-location')
          const locationName = document.querySelector<HTMLElement>('.home-location-name')
          const date = document.querySelector<HTMLElement>('#home-date')
          const dateText = document.querySelector<HTMLElement>('#home-date time')
          const header = document.querySelector<HTMLElement>('.screen-top')
          if (!location || !locationName || !date || !dateText || !header) throw new Error('Не найдены элементы заголовка')
          const range = document.createRange()
          range.selectNodeContents(dateText)
          const textBounds = range.getBoundingClientRect()
          return {
            viewport: innerWidth,
            document: document.documentElement.scrollWidth,
            locationRight: location.getBoundingClientRect().right,
            dateLeft: date.getBoundingClientRect().left,
            dateRight: date.getBoundingClientRect().right,
            textRight: textBounds.right,
            headerHeight: header.getBoundingClientRect().height,
            locationHeight: location.getBoundingClientRect().height,
            dateHeight: date.getBoundingClientRect().height,
            locationEllipsized: locationName.scrollWidth > locationName.clientWidth,
          }
        })
        expect(layout.document).toBeLessThanOrEqual(width + 1)
        expect(layout.dateLeft).toBeGreaterThanOrEqual(layout.locationRight)
        expect(layout.textRight).toBeLessThanOrEqual(layout.dateRight - 8)
        expect(layout.headerHeight).toBe(44)
        expect(layout.locationHeight).toBe(44)
        expect(layout.dateHeight).toBe(44)
        expect(layout.locationEllipsized).toBe(true)
      }
    }
  }

  // Смена correction меняет отображаемую календарную дату при неизменном civil date.
  await page.locator('#home-date').click()
  await page.getByRole('combobox', { name: 'Поправка даты' }).selectOption('1')
  await page.getByRole('button', { name: 'Назад', exact: true }).click()
  await expect(page.locator('#home-date time')).toHaveText('16 рамадан')
  await expect(page.locator('#home-date-description')).toHaveText(/^16 рамадан \d{4}$/)
  await expect(page.locator('#home-date')).toHaveAttribute('aria-describedby', 'home-date-description')

  await page.locator('#home-date').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('region', { name: 'Установка даты', exact: true })).toBeVisible()
  const back = page.getByRole('button', { name: 'Назад', exact: true })
  await back.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('region', { name: 'Главная', exact: true })).toBeVisible()
  if (testInfo.project.name === 'mobile-safari-portrait') {
    await page.locator('#home-date').tap()
    await expect(page.getByRole('region', { name: 'Установка даты', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Назад', exact: true }).click()
  }

  await page.locator('#home-date').click()
  await page.getByRole('combobox', { name: 'Месяц' }).selectOption('6')
  await page.getByRole('combobox', { name: 'День' }).selectOption('12')
  await page.getByRole('button', { name: 'Назад', exact: true }).click()
  await expect(page.locator('#home-date time')).toHaveText('12 джум. ах.')

  await page.setViewportSize({ width: 320, height: 844 })
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
  const enlargedText = await page.evaluate(() => {
    const location = document.querySelector<HTMLElement>('#home-location')
    const date = document.querySelector<HTMLElement>('#home-date')
    const header = document.querySelector<HTMLElement>('.screen-top')
    if (!location || !date || !header) throw new Error('Не найдены header controls')
    return { viewport: innerWidth, document: document.documentElement.scrollWidth,
      locationHeight: location.getBoundingClientRect().height, dateHeight: date.getBoundingClientRect().height,
      headerHeight: header.getBoundingClientRect().height, locationRight: location.getBoundingClientRect().right,
      dateRight: date.getBoundingClientRect().right }
  })
  console.info(`Header at 200% root text scale: ${JSON.stringify(enlargedText)}`)
  expect(enlargedText.locationHeight).toBeGreaterThanOrEqual(44)
  expect(enlargedText.dateHeight).toBeGreaterThanOrEqual(44)
  await page.evaluate(() => { document.documentElement.style.removeProperty('font-size') })

  // A 160 CSS-pixel viewport approximates 200% browser zoom on a 320 CSS-pixel phone.
  await page.setViewportSize({ width: 160, height: 844 })
  const zoomedViewport = await page.evaluate(() => {
    const location = document.querySelector<HTMLElement>('#home-location')
    const date = document.querySelector<HTMLElement>('#home-date')
    const header = document.querySelector<HTMLElement>('.screen-top')
    if (!location || !date || !header) throw new Error('Не найдены header controls')
    return { viewport: innerWidth, document: document.documentElement.scrollWidth,
      locationRight: location.getBoundingClientRect().right, dateRight: date.getBoundingClientRect().right,
      headerHeight: header.getBoundingClientRect().height }
  })
  console.info(`Header at 160 CSS-pixel zoom-equivalent viewport: ${JSON.stringify(zoomedViewport)}`)
  await expect(page.locator('#home-date')).toHaveAttribute('aria-describedby', 'home-date-description')
})
