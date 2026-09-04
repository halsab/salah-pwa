import { expect, test } from '@playwright/test'

test('весь интерфейс использует рукописный шрифт', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('button', { name: /Казань/ })).toBeVisible()

  const bodyFont = await page.locator('body').evaluate((element) =>
    getComputedStyle(element).fontFamily,
  )
  const buttonFont = await page.getByRole('button', { name: /Казань/ }).evaluate((element) =>
    getComputedStyle(element).fontFamily,
  )
  const decorationFont = await page.locator('.next-label').evaluate((element) =>
    getComputedStyle(element, '::before').fontFamily,
  )

  await page.getByRole('button', { name: /Казань/ }).click()
  await page.getByRole('button', { name: 'Найти город или район' }).click()
  const inputFont = await page.getByRole('searchbox').evaluate((element) =>
    getComputedStyle(element).fontFamily,
  )

  for (const fontFamily of [bodyFont, buttonFont, decorationFont, inputFont]) {
    expect(fontFamily).toContain('Neucha')
  }
})

test('после первого запуска расписание полностью открывается без сети', async ({
  context,
  page,
}) => {
  let prayerDatasetRequests = 0
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/data/prayer-times-current.json')) {
      prayerDatasetRequests += 1
    }
  })

  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Salah' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Времена намаза' }).getByRole('listitem')).toHaveCount(8)
  expect(prayerDatasetRequests).toBe(1)

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  prayerDatasetRequests = 0
  await page.reload()
  await expect(page.getByRole('list', { name: 'Времена намаза' }).getByRole('listitem')).toHaveCount(8)
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  expect(prayerDatasetRequests).toBe(0)

  const cachedPrayerDatasetRequests = await page.evaluate(async () => {
    const cacheNames = await caches.keys()
    const requests = (await Promise.all(cacheNames.map(async (name) => {
      const cache = await caches.open(name)
      return cache.keys()
    }))).flat()
    return requests
      .map(({ url }) => url)
      .filter((url) => new URL(url).pathname.endsWith('/data/prayer-times-current.json'))
  })
  expect(cachedPrayerDatasetRequests).toEqual([])

  await context.setOffline(true)
  try {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Salah' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Казань/ })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Времена намаза' }).getByRole('listitem')).toHaveCount(8)
    await expect(page.getByRole('link', { name: 'ДУМ РТ' })).toBeVisible()
    await expect(page.getByText('Доступно офлайн')).toBeVisible()
    await page.getByRole('button', { name: 'Поделиться', exact: true }).click()
    const qr = page.getByRole('img', { name: 'QR-код со ссылкой на Salah' })
    await expect(qr).toBeVisible()
    await expect.poll(() => qr.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(512)
  } finally {
    await context.setOffline(false)
  }
})

test('GPS-расписание вне Татарстана рассчитывается без справочника городов', async ({
  context,
  page,
}) => {
  let cityCatalogRequests = 0
  await page.route('**/data/cities-current.json', (route) => {
    cityCatalogRequests += 1
    return route.abort()
  })
  await page.route('https://nominatim.openstreetmap.org/**', (route) => route.abort())
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 55.7558, longitude: 37.6173 })
  await page.goto('./')

  await page.getByRole('button', { name: /Казань/ }).click()
  await page.getByRole('button', { name: 'Определить автоматически' }).click()
  await expect(page.getByRole('button', { name: /Текущее местоположение/i })).toBeVisible()
  expect(cityCatalogRequests).toBe(0)
  await expect(page.getByRole('list', { name: 'Времена намаза' }).getByRole('listitem')).toHaveCount(7)
  await expect(
    page
      .getByRole('list', { name: 'Времена намаза' })
      .getByText('Фаджр', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText(/Расчёт по настройкам · ДУМ РТ/)).toBeVisible()
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)

  await context.setOffline(true)
  try {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: /Текущее местоположение/i })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Времена намаза' }).getByRole('listitem')).toHaveCount(7)
    await expect(
      page
        .getByRole('list', { name: 'Времена намаза' })
        .getByText('Фаджр', { exact: true }),
    ).toBeVisible()
    await expect(page.getByText(/Расчёт по настройкам · ДУМ РТ/)).toBeVisible()
    expect(cityCatalogRequests).toBe(0)
  } finally {
    await context.setOffline(false)
  }
})

test('город из офлайн-справочника сохраняется и рассчитывается без сети', async ({
  context,
  page,
}) => {
  await page.goto('./')
  await page.getByRole('button', { name: /Казань/ }).click()
  await page.getByRole('button', { name: 'Найти город или район' }).click()
  await page.getByRole('searchbox').fill('Стамбул')
  await page.getByRole('button', { name: 'Стамбул, Турция' }).click()

  await expect(page.getByRole('button', { name: /Стамбул, Турция/ })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Времена намаза' }).getByRole('listitem')).toHaveCount(7)
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)

  await context.setOffline(true)
  try {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: /Стамбул, Турция/ })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Времена намаза' }).getByRole('listitem')).toHaveCount(7)
    await page.getByRole('button', { name: /Стамбул, Турция/ }).click()
    await page.getByRole('button', { name: 'Найти город или район' }).click()
    await page.getByRole('searchbox').fill('Москва')
    await expect(page.getByRole('button', { name: 'Москва, Россия' })).toBeVisible()
  } finally {
    await context.setOffline(false)
  }
})
