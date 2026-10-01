import { choosePlace, expectSchedule, readSavedSetting, expect, test } from './fixtures'

async function controlServiceWorker(page: import('@playwright/test').Page) {
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
}

test('расписание и app shell работают офлайн без кеша таблиц в Cache Storage', async ({ page, context }) => {
  await page.goto('./')
  await choosePlace(page)
  await expectSchedule(page)
  const times = await page.locator('.event-row time').allTextContents()
  await controlServiceWorker(page)
  await expectSchedule(page)

  const cacheUrls = await page.evaluate(async () => {
    const names = await caches.keys()
    const entries = await Promise.all(names.map(async (name) => {
      const cache = await caches.open(name)
      const requests = await cache.keys()
      return requests.map((request) => request.url)
    }))
    return entries.flat()
  })
  expect(cacheUrls.some((url) => url.includes('prayer-times-current.json'))).toBe(false)
  expect(cacheUrls.some((url) => /\.ttf/.test(url))).toBe(true)

  await context.setOffline(true)
  try {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expectSchedule(page)
    expect(await page.locator('.event-row time').allTextContents()).toEqual(times)
    await page.evaluate(() => document.fonts.ready)
    expect(await page.evaluate(() => Array.from(document.fonts)
      .some((face) => face.family === 'Old Timey Mono' && face.status === 'loaded'))).toBe(true)

    await page.getByRole('button', { name: 'Настройки', exact: true }).click()
    await page.getByRole('button', { name: 'Данные и конфиденциальность' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Конфиденциальность' })).toBeVisible()

    // Список праздников и статья — часть app shell и не требуют сети.
    await page.getByRole('region', { name: 'Данные и конфиденциальность' })
      .getByRole('button', { name: 'Назад' }).click()
    await page.getByRole('region', { name: 'Настройки' })
      .getByRole('button', { name: 'Назад' }).click()
    await page.locator('#home-date').click()
    await page.getByRole('button', { name: 'Праздники и события' }).click()
    await page.getByRole('button', { name: /Начало Рамадана/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Рамадан' })).toBeVisible()
  } finally { await context.setOffline(false) }
})

test('выбранный город и базовый поиск сохраняются офлайн', async ({ context, page }) => {
  await page.goto('./')
  await choosePlace(page, 'Стамбул', 'Стамбул, Стамбул, Турция')
  await expect.poll(() => readSavedSetting(page, 'locationChoice'))
    .toMatchObject({ place: { cityId: 745044 } })
  await controlServiceWorker(page)
  await context.setOffline(true)
  try {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expectSchedule(page, 7)
    await page.locator('#home-location').click()
    await page.getByRole('button', { name: 'Найти город' }).click()
    await page.getByRole('searchbox').fill('Москва')
    await expect(page.getByRole('button', { name: 'Москва, Москва, Россия', exact: true })).toBeVisible()
  } finally { await context.setOffline(false) }
})

test('manifest устанавливаемого приложения не фиксирует ориентацию', async ({ request }) => {
  const manifest = await (await request.get('./manifest.webmanifest')).json() as Record<string, unknown>
  expect(manifest).not.toHaveProperty('orientation')
  expect(manifest).toMatchObject({
    theme_color: '#000000',
    background_color: '#000000',
    scope: './',
    start_url: './',
  })
})
