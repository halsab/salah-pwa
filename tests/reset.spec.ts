import type { Page } from '@playwright/test'
import { expect, readSavedSetting, test } from './fixtures'

async function openReset(page: Page) {
  await page.getByRole('button', { name: 'Настройки', exact: true }).click()
  await page.getByRole('button', { name: 'Данные', exact: true }).click()
  await page.getByRole('button', { name: 'Сбросить данные приложения', exact: true }).click()
}
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
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto('./')
  await expect(page.getByRole('listitem')).toHaveCount(8)
  await page.getByRole('button', { name: /Казань/ }).click()
  await page.getByRole('button', { name: 'Найти город или район' }).click()
  await page.getByRole('searchbox').fill('Стамбул')
  await page.getByRole('button', { name: 'Стамбул, Стамбул, Турция', exact: true }).click()
  await page.getByRole('button', { name: 'Настройки', exact: true }).click()
  await page.getByLabel('Оформление').selectOption('dark')
  await expect.poll(() => readSavedSetting(page, 'appearance')).toBe('dark')
  await page.getByRole('button', { name: 'Время намаза', exact: true }).click()
  await page.getByRole('button', { name: 'Расширенные настройки', exact: true }).click()
  await page.getByLabel('Угол Фаджра, °').fill('19')
  await page.getByRole('button', { name: 'Применить ручной расчёт', exact: true }).click()
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click()
  const before = await counts(page)
  await openReset(page)
  await page.getByRole('button', { name: 'Отмена', exact: true }).click()
  expect(await counts(page)).toEqual(before)
  await expect(page.getByRole('button', { name: 'Сбросить данные приложения', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Сбросить данные приложения', exact: true }).click()
  await page.evaluate(() => {
    const clear = Object.getOwnPropertyDescriptor(IDBObjectStore.prototype, 'clear')?.value as IDBObjectStore['clear']
    IDBObjectStore.prototype.clear = function () {
      if (this.name === 'days') { IDBObjectStore.prototype.clear = clear; throw new Error('injected failure') }
      return clear.call(this)
    }
  })
  await page.getByRole('button', { name: 'Удалить данные', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Не удалось сбросить')
  expect(await counts(page)).toEqual(before)
  await page.screenshot({ path: '/tmp/salah-stage5-reset-error-320-dark.png' })
  const second = await context.newPage()
  await second.clock.setFixedTime(new Date('2026-09-04T09:30:00Z'))
  await second.goto('./')
  await expect(second.getByRole('button', { name: /Стамбул/ })).toBeVisible()
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Повторить сброс', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Выбрать место', exact: true })).toBeVisible()
  await expect(second.getByRole('button', { name: 'Выбрать место', exact: true })).toBeVisible()
  expect(await counts(page)).toEqual([0, 0, 0])
  await page.reload()
  await expect(page.getByRole('button', { name: 'Выбрать место', exact: true })).toBeVisible()
  expect(await counts(page)).toEqual([0, 0, 0])
  await expect(page.getByRole('timer')).toHaveCount(0)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'system')
  await page.getByRole('button', { name: 'Выбрать место', exact: true }).click()
  await page.getByRole('button', { name: 'Найти город или район' }).click()
  await page.getByRole('searchbox').fill('Стамбул')
  await page.getByRole('button', { name: 'Стамбул, Стамбул, Турция', exact: true }).click()
  await expect(page.getByRole('listitem')).toHaveCount(7)
  await expect(page.getByRole('button', { name: /Расчётное время/ })).toBeVisible()
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
  await expect(page.getByRole('listitem')).toHaveCount(8)
  await page.getByRole('button', { name: /Казань/ }).click()
  await page.getByRole('button', { name: 'Определить автоматически' }).click()
  await expect.poll(() => page.evaluate(() => (window as Window & { gpsRequests: number }).gpsRequests)).toBe(2)
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click()
  let releaseRefresh!: () => void
  const gate = new Promise<void>(resolve => { releaseRefresh = resolve })
  let refreshStarted = false
  await context.route('**/data/prayer-times-manifest.json', async route => { refreshStarted = true; await gate; await route.continue().catch(() => undefined) })
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect.poll(() => refreshStarted).toBe(true)
  await holdSettings(page)
  await page.getByRole('button', { name: 'Настройки', exact: true }).click()
  await page.getByLabel('Оформление').selectOption('dark')
  await page.getByRole('button', { name: 'Данные', exact: true }).click()
  await page.getByRole('button', { name: 'Сбросить данные приложения', exact: true }).click()
  await page.getByRole('button', { name: 'Удалить данные', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Удаляем данные…', exact: true })).toBeDisabled()
  await page.evaluate(() => (window as Window & { deliverGps: () => void }).deliverGps())
  releaseRefresh()
  await releaseSettings(page)
  await expect(page.getByRole('button', { name: 'Выбрать место', exact: true })).toBeVisible()
  expect(await counts(page)).toEqual([0, 0, 0])
  await page.reload()
  await expect(page.getByRole('button', { name: 'Выбрать место', exact: true })).toBeVisible()
  expect(await page.evaluate(() => (window as Window & { gpsRequests: number }).gpsRequests)).toBe(0)
  expect(await counts(page)).toEqual([0, 0, 0])
})

test('320 px: source details, nested dialogs, expert errors, both themes and long place names', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({width:320,height:740})
  await page.emulateMedia({colorScheme:'light',reducedMotion:'reduce'})
  await page.goto('./')
  await expect(page).toHaveTitle(/Salah/)
  await expect(page.getByRole('listitem')).toHaveCount(8)
  await expect(page.getByRole('button', {name:/Расширенные|Методика/})).toHaveCount(0)
  await page.screenshot({path:'/tmp/salah-stage5-main-320-light.png',fullPage:true})
  const source = page.getByRole('button', {name:/Официальное расписание · ДУМ РТ/})
  await source.click()
  const sourceDialog = page.getByRole('dialog', {name:'Сведения об источнике'})
  await expect(sourceDialog).toBeVisible()
  const sourceBounds = await sourceDialog.boundingBox()
  expect(sourceBounds).not.toBeNull()
  expect((sourceBounds?.y ?? 0) + (sourceBounds?.height ?? 0)).toBeLessThanOrEqual(741)
  await expect(page.getByText('Europe/Moscow',{exact:true})).toBeVisible()
  await page.screenshot({path:'/tmp/salah-stage5-source-320-light.png'})
  await page.keyboard.press('Escape')
  await expect(source).toBeFocused()
  await holdSettings(page, 'days')
  await page.getByRole('button', {name:'Следующий день'}).click()
  await expect(page.getByLabel('Загружаем расписание',{exact:true})).toBeVisible()
  await expect(page.getByRole('timer')).toHaveCount(0)
  await expect(page.getByRole('listitem')).toHaveCount(0)
  await page.screenshot({path:'/tmp/salah-stage5-loading-320-light.png',fullPage:true})
  await releaseSettings(page)
  await expect(page.getByRole('listitem')).toHaveCount(8)
  await expect(page.getByRole('timer')).toHaveCount(0)
  await page.getByRole('button', {name:'Сегодня',exact:true}).click()
  await page.getByRole('button', {name:'Настройки',exact:true}).click()
  await expect(page.getByLabel('Оформление')).toHaveValue('system')
  await page.getByLabel('Оформление').selectOption('dark')
  await page.screenshot({path:'/tmp/salah-stage5-settings-320-dark.png'})
  await page.getByRole('button', {name:'Время намаза',exact:true}).click()
  await page.getByRole('button', {name:'Расширенные настройки',exact:true}).click()
  await page.getByLabel('Угол Фаджра, °').fill('18.')
  await page.getByRole('button', {name:'Применить ручной расчёт'}).click()
  await expect(page.getByRole('alert')).toContainText('Незавершённые числа')
  await page.getByLabel('Угол Фаджра, °').fill('19')
  await page.getByLabel('Способ Иша').selectOption('interval')
  await page.getByLabel('Интервал Иша, мин').fill('95')
  await page.getByLabel('Поправка: Аср',{exact:true}).fill('-12')
  await page.getByRole('button', {name:'Применить ручной расчёт'}).click()
  await expect(page.getByRole('status')).toContainText('Ручной расчёт применён')
  await page.getByRole('button', {name:'Как рассчитывается время'}).click()
  await expect(page.getByRole('dialog', {name:'Как рассчитывается время'})).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', {name:'Как рассчитывается время'})).toBeFocused()
  await page.getByRole('button', {name:'← Назад'}).click()
  await page.getByRole('button', {name:'Вернуться к автоматическому выбору'}).click()
  await expect(page.getByLabel('Источник',{exact:true})).toHaveValue('automatic')
  await page.getByRole('button', {name:'← Назад'}).click()
  await page.getByRole('button', {name:/Местоположение · Казань/}).click()
  await page.getByRole('button', {name:'Найти город или район'}).click()
  await page.getByRole('searchbox').fill('Стамбул')
  await page.getByRole('button', {name:'Стамбул, Стамбул, Турция',exact:true}).click()
  await expect(page.getByRole('dialog', {name:'Настройки'})).toBeVisible()
  await expect(page.getByRole('button', {name:/Местоположение · Стамбул/})).toBeFocused()
  await page.getByRole('button', {name:'Закрыть',exact:true}).click()
  await expect(page.getByRole('button', {name:/Стамбул, Стамбул, Турция/})).toBeVisible()
  await expect(page.locator('.location-control span')).toHaveCSS('white-space','normal')
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({path:'/tmp/salah-stage5-main-320-dark.png',fullPage:true})
  expect(errors).toEqual([])
})
