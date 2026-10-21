import { choosePlace, expect, readSavedSetting, test } from './fixtures'

test('initial low-accuracy GPS stays provisional until explicit acceptance', async ({ context, page }) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 41.01, longitude: 28.95, accuracy: 2400 })
  await page.goto('./')
  await page.getByRole('button', { name: 'По геопозиции' }).click()

  await expect(page.getByRole('heading', { name: 'Выберите место' })).toBeVisible()
  await expect(page.getByText('41.0100, 28.9500')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Использовать эту точку' })).toBeVisible()
  await expect(page.getByRole('timer')).toHaveCount(0)
  await expect.poll(() => readSavedSetting(page, 'locationChoice')).toBeUndefined()
  await expect.poll(() => readSavedSetting(page, 'recentPlaces')).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ selection: 'gps', latitude: 41.01, longitude: 28.95 }),
  ]))

  await page.getByRole('button', { name: 'Использовать эту точку' }).click()
  await expect(page.getByRole('region', { name: 'Главная', exact: true })).toBeVisible()
  await expect(page.getByRole('timer')).toBeVisible()
  await expect.poll(() => readSavedSetting(page, 'locationChoice')).toMatchObject({
    place: { selection: 'gps', latitude: 41.01, longitude: 28.95, accuracy: 2400 },
  })
})

test('search cancels delayed unaccepted GPS callbacks', async ({ page }) => {
  await page.addInitScript(() => {
    const target = window as Window & { __gpsCallbacks: Array<(position: GeolocationPosition) => void> }
    target.__gpsCallbacks = []
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: {
      query: () => Promise.resolve({ state: 'granted', onchange: null }),
    } })
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition: (success: (position: GeolocationPosition) => void) => target.__gpsCallbacks.push(success),
    } })
  })
  await page.goto('./')
  await choosePlace(page)
  const confirmed = await readSavedSetting(page, 'locationChoice')
  await page.locator('#home-location').click()
  await page.getByRole('button', { name: 'По геопозиции' }).click()
  await expect.poll(() => page.evaluate(() => (window as Window & { __gpsCallbacks: unknown[] }).__gpsCallbacks.length)).toBe(2)
  await page.evaluate(() => {
    const target = window as Window & { __gpsCallbacks: Array<(position: GeolocationPosition) => void> }
    target.__gpsCallbacks[0]({
      coords: { latitude: 41.01, longitude: 28.95, accuracy: 2400, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
      timestamp: Date.now(),
    })
  })
  await expect(page.getByText('41.0100, 28.9500')).toBeVisible()

  await page.getByRole('button', { name: 'Найти город' }).click()
  const search = page.getByRole('searchbox')
  await search.fill('Москва')
  await page.evaluate(() => {
    const target = window as Window & { __gpsCallbacks: Array<(position: GeolocationPosition) => void> }
    target.__gpsCallbacks[1]({
      coords: { latitude: 41.011, longitude: 28.951, accuracy: 15, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
      timestamp: Date.now(),
    })
  })

  await expect(search).toHaveValue('Москва')
  await expect(page.getByRole('region', { name: 'Поиск города' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Главная', exact: true })).toHaveCount(0)
  await expect.poll(() => readSavedSetting(page, 'locationChoice')).toEqual(confirmed)
  await expect.poll(() => readSavedSetting(page, 'recentPlaces')).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ selection: 'gps', latitude: 41.01, longitude: 28.95 }),
  ]))
})

test('denied GPS leaves initial location selection available', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: {
      query: () => Promise.resolve({ state: 'granted', onchange: null }),
    } })
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition: (_success: unknown, error: (failure: GeolocationPositionError) => void) => error({
        code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3,
      }),
    } })
  })
  await page.goto('./')
  await page.getByRole('button', { name: 'По геопозиции' }).click()
  await expect(page.getByRole('heading', { name: 'Выберите место' })).toBeVisible()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Найти город' })).toBeVisible()
  await expect(page.getByRole('timer')).toHaveCount(0)
  await expect.poll(() => readSavedSetting(page, 'locationChoice')).toBeUndefined()
})
