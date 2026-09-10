import type { Page } from '@playwright/test'
import { back, choosePlace, openSchedule, openSource, openReset, setSource, expect, readSavedSetting, test } from './fixtures'

async function counts(page: Page) {
  return page.evaluate(() => new Promise<number[]>((resolve, reject) => {
    const request = indexedDB.open('salah')
    request.onerror = () => reject(request.error ?? new Error('IndexedDB unavailable'))
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction(['settings', 'days', 'meta'])
      const reads = ['settings', 'days', 'meta'].map(store => tx.objectStore(store).count())
      tx.oncomplete = () => { db.close(); resolve(reads.map(read => read.result)) }
    }
  }))
}
async function holdSettings(page: Page, store = 'settings') {
  await page.evaluate(store => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('salah')
    request.onerror = () => reject(request.error ?? new Error('IndexedDB unavailable'))
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction(store, 'readwrite')
      let release = false
      Object.assign(window, { releaseSettings: () => { release = true } })
      const keep = () => { if (!release) tx.objectStore(store).get('locationChoice').onsuccess = keep }
      keep(); resolve()
      tx.oncomplete = () => db.close()
    }
  }), store)
}
async function releaseSettings(page: Page) {
  await page.evaluate(() => (window as Window & { releaseSettings: () => void }).releaseSettings())
}

test('reset: cancel, transactional failure, retry, two tabs, offline and restart', async ({ page, context }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto('./')
  await choosePlace(page)
  await choosePlace(page, 'Стамбул', 'Стамбул, Стамбул, Турция')
  await openSource(page)
  await setSource(page, 'Ручной расчёт')
  await back(page)
  await back(page)
  const before = await counts(page)
  await openReset(page)
  await page.getByRole('button', { name: 'Назад', exact: true }).click()
  expect(await counts(page)).toEqual(before)
  await expect(page.getByRole('button', { name: 'Удалить данные', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Удалить данные', exact: true }).click()
  await page.evaluate(() => {
    const clear = Object.getOwnPropertyDescriptor(IDBObjectStore.prototype, 'clear')?.value as IDBObjectStore['clear']
    IDBObjectStore.prototype.clear = function () {
      if (this.name === 'days') { IDBObjectStore.prototype.clear = clear; throw new Error('injected failure') }
      return clear.call(this)
    }
  })
  await page.getByRole('button', { name: 'Удалить данные', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Не удалось удалить')
  expect(await counts(page)).toEqual(before)
  expect(errors).toEqual([])
  await page.screenshot({ path: '/tmp/salah-stage5-reset-error-320-dark.png' })
  const second = await context.newPage()
  await second.clock.setFixedTime(new Date('2026-09-04T09:30:00Z'))
  await second.goto('./')
  await expect(second.getByRole('button', { name: /Стамбул/ })).toBeVisible()
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Повторить', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Найти город', exact: true })).toBeVisible()
  await expect(second.getByRole('button', { name: 'Найти город', exact: true })).toBeVisible()
  expect(await counts(page)).toEqual([0, 0, 0])
  await page.reload()
  await expect(page.getByRole('button', { name: 'Найти город', exact: true })).toBeVisible()
  expect(await counts(page)).toEqual([0, 0, 0])
  await expect(page.getByRole('timer')).toHaveCount(0)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Найти город', exact: true }).click()
  await page.getByRole('searchbox').fill('Стамбул')
  await page.getByRole('button', { name: 'Стамбул, Стамбул, Турция', exact: true }).click()
  await openSchedule(page, 7)
  await expect.poll(() => readSavedSetting(page, 'locationChoice')).toMatchObject({ place: { cityId: 745044 } })
})

test('reset drains a pending save and rejects late GPS and refresh; granted GPS stays idle after restart', async ({ page, context }) => {
  await context.grantPermissions(['geolocation'])
  await page.addInitScript(() => {
    const pending: PositionCallback[] = []
    Object.assign(window, { gpsRequests: 0, deliverGps: () => pending.forEach(callback => callback({ coords: { latitude: 55.8, longitude: 49.1, accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now(), toJSON: () => ({}) })) })
    navigator.geolocation.getCurrentPosition = callback => {
      (window as Window & { gpsRequests: number }).gpsRequests += 1
      pending.push(callback)
    }
  })
  await page.goto('./')
  await choosePlace(page)
  await page.getByRole('button', { name: /Казань/ }).click()
  await page.getByRole('button', { name: 'По геопозиции' }).click()
  await expect.poll(() => page.evaluate(() => (window as Window & { gpsRequests: number }).gpsRequests)).toBe(2)
  await page.getByRole('button', { name: 'Назад', exact: true }).click()
  let releaseRefresh!: () => void
  const gate = new Promise<void>(resolve => { releaseRefresh = resolve })
  let refreshStarted = false
  await context.route('**/data/prayer-times-manifest.json', async route => { refreshStarted = true; await gate; await route.continue().catch(() => undefined) })
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect.poll(() => refreshStarted).toBe(true)
  await holdSettings(page)
  await openSource(page)
  await setSource(page, 'Ручной расчёт')
  await back(page)
  await back(page)
  await openReset(page)
  await page.getByRole('button', { name: 'Удалить данные', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Удаляем данные…', exact: true })).toBeDisabled()
  await page.evaluate(() => (window as Window & { deliverGps: () => void }).deliverGps())
  releaseRefresh()
  await releaseSettings(page)
  await expect(page.getByRole('button', { name: 'Найти город', exact: true })).toBeVisible()
  expect(await counts(page)).toEqual([0, 0, 0])
  await page.reload()
  await expect(page.getByRole('button', { name: 'Найти город', exact: true })).toBeVisible()
  expect(await page.evaluate(() => (window as Window & { gpsRequests: number }).gpsRequests)).toBe(0)
  expect(await counts(page)).toEqual([0, 0, 0])
})
