import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { back, choosePlace, openSchedule, openSource, setSource, expect, readSavedSetting, test } from './fixtures'
import type { PrayerDataset } from '../src/domain/types'

test('расчётный холодный старт работает при зависшем официальном запросе', async ({ page }) => {
  await page.route('**/data/prayer-times-manifest.json', () => new Promise(() => {}))
  await page.goto('./')
  await choosePlace(page, 'Стамбул', 'Стамбул, Стамбул, Турция')
  await openSchedule(page, 7)
  await back(page)
  await openSource(page)
  await expect(page.getByRole('button', { name: 'Способ Авто' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Таблица|Параметры|Профиль/ })).toHaveCount(0)
})

test('сначала показывает кеш, затем проверенную фоновую версию таблицы', async ({ page, context }) => {
  await page.goto('./')
  await choosePlace(page)
  await openSchedule(page)
  const asr = page.locator('.event-row').filter({ hasText: 'Аср' }).locator('time')
  const before = await asr.textContent()
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const updated = JSON.parse(await readFile('dist/data/prayer-times-current.json', 'utf8')) as PrayerDataset
  for (const day of updated.days) if (day.locationId === 'kazan') day.asr = '16:25'
  const bytes = `${JSON.stringify(updated)}\n`
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  let receivedManifest = false, receivedBytes = false
  await context.route('**/data/prayer-times-manifest.json', async route => {
    receivedManifest = true
    await gate
    await route.fulfill({ json: { schemaVersion: 1, version: `2-${sha256.slice(0, 16)}`, sha256, url: 'prayer-times-current.json', sequence: 2 } })
  })
  await context.route('**/data/prayer-times-current.json', async route => {
    receivedBytes = true
    await route.fulfill({ contentType: 'application/json', body: bytes })
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await openSchedule(page)
  await expect(asr).toHaveText(before ?? '')
  await expect.poll(() => receivedManifest).toBe(true)
  release()
  await expect.poll(() => receivedBytes).toBe(true)
  await expect(asr).toHaveText('16:25')
})

test('источник и параметры сохраняются сразу; ДУМ РТ не заменяется расчётом за пределами даты', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('./')
  await choosePlace(page)
  await openSource(page)
  await setSource(page, 'Ручной расчёт')
  await page.getByRole('button', { name: /^Профиль/ }).click()
  await page.getByRole('button', { name: 'Карачи', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Профиль/ })).toBeFocused()
  await page.getByRole('button', { name: 'Параметры' }).click()
  await expect(page.getByRole('combobox')).toHaveCount(2)
  await page.getByRole('combobox', { name: 'Аср', exact: true }).selectOption('standard')
  await expect.poll(() => readSavedSetting(page, 'sourcePreferences')).toMatchObject({ mode: 'manual', source: { kind: 'calculated', calculation: { profile: 'karachi', overrides: { asrMethod: 'standard' } } } })
  await page.reload()
  await openSchedule(page, 7)
  await back(page)
  await openSource(page)
  await expect(page.getByRole('button', { name: 'Профиль Карачи' })).toBeVisible()
  await setSource(page, 'Автоматически')
  await back(page)
  await back(page)
  await page.getByLabel('Выбрать дату').fill('2027-01-01')
  await expect(page.getByRole('listitem')).toHaveCount(7)
  await back(page)
  await openSource(page)
  await setSource(page, 'Таблица ДУМ РТ')
  await expect(page.getByRole('button', { name: 'Таблица', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Таблица ДУМ РТ', exact: true })).toHaveCount(0)
  await back(page)
  await back(page)
  await page.getByLabel('Выбрать дату').fill('2027-01-01')
  await expect(page.getByRole('alert')).toContainText('не покрывает это место или дату')
  await expect(page.getByRole('listitem')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('ошибка сохранения видна на экранах; повтор сохраняет последние место и настройки вместе', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('./')
  await choosePlace(page)
  await page.evaluate(() => {
    const put = Object.getOwnPropertyDescriptor(IDBObjectStore.prototype, 'put')?.value as IDBObjectStore['put']
    Object.assign(window, { restoreStorage: () => { IDBObjectStore.prototype.put = put } })
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'settings') throw new DOMException('Quota exhausted', 'QuotaExceededError')
      return put.apply(this, args)
    }
  })
  await choosePlace(page, 'Стамбул', 'Стамбул, Стамбул, Турция')
  await expect(page.getByRole('status')).toContainText('Не удалось сохранить изменения')
  await openSource(page)
  await setSource(page, 'Ручной расчёт')
  await expect(page.getByRole('status')).toContainText('Не удалось сохранить изменения')
  await page.evaluate(() => (window as Window & { restoreStorage: () => void }).restoreStorage())
  await page.getByRole('button', { name: 'Повторить', exact: true }).click()
  await expect(page.getByRole('status')).toHaveCount(0)
  await expect.poll(() => readSavedSetting(page, 'locationChoice')).toMatchObject({ place: { cityId: 745044 } })
  await expect.poll(() => readSavedSetting(page, 'sourcePreferences')).toMatchObject({ mode: 'manual' })
  await page.reload()
  await expect(page.locator('#home-location')).toContainText('Стамбул')
  await openSchedule(page, 7)
  expect(errors).toEqual([])
})
