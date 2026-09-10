import { readFile } from 'node:fs/promises'
import { back, choosePlace, openSchedule, expect, readSavedSetting, test } from './fixtures'

const index = JSON.parse(await readFile('public/data/cities/index.json', 'utf8')) as {
  version: string
  shards: { id: string; bytes: number }[]
}
const shardPattern = /\/data\/cities\/[a-f0-9]{20}\/[A-Z]{2}-[0-9]+\.json$/

test('старт и обзор не загружают пакеты; Киров различим и ранжирован; загруженные города доступны офлайн', async ({ page, context }) => {
  const requests: string[] = []
  context.on('request', r => requests.push(r.url()))
  await page.goto('./')
  await choosePlace(page)
  await page.evaluate(async () => navigator.serviceWorker.ready)
  expect(requests.filter(url => shardPattern.test(url))).toEqual([])
  await page.getByRole('button', { name: /Казань/ }).click()
  await page.getByRole('button', { name: 'Найти город' }).click()
  await expect(page.getByRole('searchbox')).toBeVisible()
  expect(requests.filter(url => shardPattern.test(url))).toEqual([])
  expect(requests.some(url => url.endsWith('/cities-current.json'))).toBe(false)
  const caches = await page.evaluate(async () => {
    const names = await globalThis.caches.keys()
    return (await Promise.all(names.map(async name => (await (await globalThis.caches.open(name)).keys()).map(r => r.url)))).flat()
  })
  expect(caches.filter(url => shardPattern.test(url))).toEqual([])
  await page.getByRole('searchbox').fill('Киров')
  const large = page.getByRole('button', { name: 'Киров, Кировская Область, Россия', exact: true })
  const small = page.getByRole('button', { name: 'Киров, Калужская Область, Россия', exact: true })
  await expect(large).toBeVisible()
  await expect(small).toBeVisible()
  await expect(large).toHaveText(/Кировская Область/)
  const matches = page.locator('.city-result')
  await expect(matches.first()).toHaveAccessibleName('Киров, Кировская Область, Россия')
  const fetched = [...new Set(requests.filter(url => shardPattern.test(url)))]
  expect(fetched.length).toBeGreaterThan(0)
  expect(fetched.length).toBeLessThanOrEqual(32)
  console.log(JSON.stringify({ query: 'Киров', shards: fetched.map(url => url.split('/').pop()), bytes: fetched.reduce((n, url) => n + (index.shards.find(s => url.endsWith(`/${s.id}.json`))?.bytes ?? 0), 0) }))
  await large.click()
  await expect.poll(() => readSavedSetting(page, 'locationChoice')).toMatchObject({place:{name:'Киров, Кировская Область, Россия'}})
  await openSchedule(page, 7)
    await back(page)
  await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  await context.setOffline(true)
  try {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openSchedule(page, 7)
    await back(page)
    await page.getByRole('button', { name: /Киров, Кировская/ }).click()
    await page.getByRole('button', { name: 'Найти город' }).click()
    await page.getByRole('searchbox').fill('Киров')
    await expect(large).toBeVisible()
    await expect(small).toBeVisible()
    await expect(page.getByRole('list', { name: 'Результаты поиска' })).toBeVisible()
    await page.getByRole('searchbox').fill('Будапешт')
    await expect(page.getByText(/Для полного поиска нужен интернет/, { exact: false }).last()).toBeVisible()
    await expect(page.getByText('Город не найден')).toHaveCount(0)
  } finally { await context.setOffline(false) }
  await page.getByRole('button', { name: 'Повторить' }).click()
  await expect(page.getByRole('button', { name: /^Будапешт,/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Повторить' })).toHaveCount(0)
})

test('базовый обзор работает после установки офлайн, старый монолитный кеш удалён без изменения выбранного места', async ({ page, context }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('city-cache-seeded')) return
    sessionStorage.setItem('city-cache-seeded', '1')
    void globalThis.caches.open('city-data').then(cache => cache.put('/salah-pwa/data/cities-current.json', new Response('{}')))
  })
  await page.goto('./')
  await choosePlace(page)
  await expect(page.getByRole('timer')).toBeVisible()
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await expect.poll(() => page.evaluate(async () => (await globalThis.caches.keys()).includes('city-data'))).toBe(false)
  await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  await expect(page.getByRole('timer')).toBeVisible()
  await context.setOffline(true)
  try {
    await page.getByRole('button', { name: /Казань/ }).click()
    await page.getByRole('button', { name: 'Найти город' }).click()
    await expect(page.getByRole('searchbox')).toBeVisible()
    await page.getByRole('searchbox').fill('Москва')
    await expect(page.getByRole('button', { name: 'Москва, Москва, Россия', exact: true })).toBeVisible()
  } finally { await context.setOffline(false) }
})
