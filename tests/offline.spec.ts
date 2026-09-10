import { back, choosePlace, openSchedule, openSource, expect, readSavedSetting, test } from './fixtures'

async function controlServiceWorker(page: import('@playwright/test').Page) {
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
}

test('локальный Old Timey Mono загружен, без синтетических начертаний и прежних шрифтов', async ({ page }) => {
  await page.goto('./')
  await choosePlace(page)
  await openSchedule(page)
  await page.evaluate(() => document.fonts.ready)
  for (const selector of ['body', 'button', '.event-row', '.event-row time']) {
    await expect(page.locator(selector).first()).toHaveCSS('font-family', '"Old Timey Mono", monospace')
    await expect(page.locator(selector).first()).toHaveCSS('font-weight', '400')
  }
  await expect(page.locator('.event-row time').first()).toHaveCSS('font-variant-numeric', 'tabular-nums')
  const faces = await page.evaluate(() => Array.from(document.fonts).map(({ family, weight, status }) => ({ family, weight, status })))
  expect(faces).toEqual([{ family: 'Old Timey Mono', weight: '400', status: 'loaded' }])
  await back(page)
  await page.locator('#home-location').click()
  await page.getByRole('button', { name: 'Найти город' }).click()
  await expect(page.getByRole('searchbox')).toHaveCSS('font-family', '"Old Timey Mono", monospace')
})

test('manifest использует чёрный фон и не ограничивает ориентацию', async ({ request }) => {
  const manifest = await (await request.get('./manifest.webmanifest')).json() as Record<string, unknown>
  expect(manifest).not.toHaveProperty('orientation')
  expect(manifest).toMatchObject({ theme_color: '#000000', background_color: '#000000', scope: './', start_url: './' })
})

test('расписание, шрифт, источник и QR доступны офлайн без кеша таблиц в Cache Storage', async ({ page, context }) => {
  let datasets = 0
  page.on('request', request => { if (request.url().endsWith('/data/prayer-times-current.json')) datasets += 1 })
  await page.goto('./')
  await choosePlace(page)
  expect(datasets).toBe(1)
  await openSchedule(page)
  const times = await page.locator('.event-row time').allTextContents()
  await page.evaluate(async () => navigator.serviceWorker.ready)
  datasets = 0
  await controlServiceWorker(page)
  await openSchedule(page)
  expect(datasets).toBe(0)
  const cacheUrls = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async name => (await (await caches.open(name)).keys()).map(request => request.url)))).flat())
  expect(cacheUrls.some(url => url.includes('prayer-times-current.json'))).toBe(false)
  expect(cacheUrls.some(url => /\.ttf/.test(url))).toBe(true)
  expect(cacheUrls.some(url => /Alegreya|paper-texture/.test(url))).toBe(false)
  await context.setOffline(true)
  try {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openSchedule(page)
    expect(await page.locator('.event-row time').allTextContents()).toEqual(times)
    await page.evaluate(() => document.fonts.ready)
    expect(await page.evaluate(() => Array.from(document.fonts).some(face => face.family === 'Old Timey Mono' && face.status === 'loaded'))).toBe(true)
    await back(page)
    await openSource(page)
    await page.getByRole('button', { name: 'О расписании' }).click()
    await page.getByText('Подробности', { exact: true }).click()
    await expect(page.getByRole('link', { name: 'Первичный источник · ДУМ РТ' })).toBeVisible()
    await back(page)
    await back(page)
    await page.getByRole('button', { name: 'Поделиться' }).click()
    const qr = page.getByRole('img', { name: /QR-код/ })
    await expect(qr).toBeVisible()
    await expect.poll(() => qr.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0)
  } finally { await context.setOffline(false) }
})

test('GPS вне Татарстана рассчитывается без справочника городов, включая офлайн', async ({ context, page }) => {
  let cities = 0
  await page.route('**/data/cities/*/*.json', route => { cities += 1; return route.abort() })
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 55.7558, longitude: 37.6173 })
  await page.goto('./')
  await page.getByRole('button', { name: 'По геопозиции' }).click()
  await expect(page.locator('#home-location')).toContainText(/Моё местоположение/i)
  await openSchedule(page, 7)
  expect(cities).toBe(0)
  await expect.poll(() => readSavedSetting(page, 'locationChoice')).toMatchObject({ mode: 'calculated', source: 'automatic', coordinates: { latitude: 55.7558, longitude: 37.6173 } })
  await controlServiceWorker(page)
  await context.setOffline(true)
  try {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openSchedule(page, 7)
    await expect(page.getByRole('list').getByText('Фаджр', { exact: true })).toBeVisible()
    expect(cities).toBe(0)
  } finally { await context.setOffline(false) }
})

test('выбранный город и базовый поиск сохраняются офлайн', async ({ context, page }) => {
  await page.goto('./')
  await choosePlace(page, 'Стамбул', 'Стамбул, Стамбул, Турция')
  await expect.poll(() => readSavedSetting(page, 'locationChoice')).toMatchObject({ place: { cityId: 745044 } })
  await controlServiceWorker(page)
  await context.setOffline(true)
  try {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openSchedule(page, 7)
    await back(page)
    await page.locator('#home-location').click()
    await page.getByRole('button', { name: 'Найти город' }).click()
    await page.getByRole('searchbox').fill('Москва')
    await expect(page.getByRole('button', { name: 'Москва, Москва, Россия', exact: true })).toBeVisible()
  } finally { await context.setOffline(false) }
})

test('локальная граница Татарстана выбирает ту же официальную таблицу без сети', async ({ context, page }) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 55.7961, longitude: 49.1064, accuracy: 20 })
  await page.goto('./')
  await choosePlace(page)
  await controlServiceWorker(page)
  expect(await page.evaluate(async () => Boolean(await caches.match('/salah-pwa/data/tatarstan-boundary.json', { ignoreSearch: true })))).toBe(true)
  await context.setOffline(true)
  try {
    await page.locator('#home-location').click()
    await page.getByRole('button', { name: 'По геопозиции' }).click()
    await expect(page.locator('#home-location')).toContainText(/Моё местоположение|Рядом:/)
    await openSchedule(page)
    await back(page)
    await openSource(page)
    await page.getByRole('button', { name: 'О расписании' }).click()
    await page.getByText('Подробности', { exact: true }).click()
    await expect(page.getByRole('region', { name: 'Сведения об источнике' }).getByText('Казань', { exact: true })).toBeVisible()
    expect(await readSavedSetting(page, 'locationChoice')).toMatchObject({ place: { region: { code: 'RU-TA' } } })
  } finally { await context.setOffline(false) }
})
