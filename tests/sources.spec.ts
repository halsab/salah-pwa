import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { expect, readSavedSetting, test } from './fixtures'
import type { PrayerDataset } from '../src/domain/types'

test('cold start calculation works while official requests hang', async ({ page }) => {
  await page.route('**/data/prayer-times-manifest.json', () => new Promise(() => {}))
  await page.goto('./')
  await expect(page.getByRole('button', { name: /Казань/ })).toBeVisible()
  await page.getByRole('button', { name: /Казань/ }).click()
  await page.getByRole('button', { name: 'Найти город или район' }).click()
  await page.getByRole('searchbox').fill('Стамбул')
  await page.getByRole('button', { name: 'Стамбул, Стамбул, Турция', exact: true }).click()
  await expect(page.getByRole('listitem')).toHaveCount(7)
  await expect(page.getByRole('button', { name: /Расчётное время/ })).toBeVisible()
  await page.getByRole('button', { name: 'Настройки' }).click()
  await page.getByRole('button', { name: 'Время намаза' }).click()
  await expect(page.getByLabel('Источник', { exact: true })).toHaveValue('automatic')
})

test('cached first render precedes network; validated background version replaces the displayed rows', async ({ page, context }) => {
  await page.goto('./')
  await expect(page.getByRole('listitem')).toHaveCount(8)
  const before = await page.locator('.prayer-row').filter({ hasText: 'Аср' }).locator('time').textContent()
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const updated = JSON.parse(await readFile('dist/data/prayer-times-current.json', 'utf8')) as PrayerDataset
  for (const day of updated.days) if (day.locationId === 'kazan') day.asr = '16:25'
  const bytes = `${JSON.stringify(updated)}\n`
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  let receivedManifest = false
  let receivedBytes = false
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
  await expect(page.getByRole('listitem')).toHaveCount(8)
  await expect(page.locator('.prayer-row').filter({ hasText: 'Аср' }).locator('time')).toHaveText(before ?? '')
  await expect.poll(() => receivedManifest).toBe(true)
  release()
  await expect.poll(() => receivedBytes).toBe(true)
  await expect(page.locator('.prayer-row').filter({ hasText: 'Аср' }).locator('time')).toHaveText('16:25')
  await expect(page.getByRole('listitem')).toHaveCount(8)
})

test('source mode persists across reload and manual official does not silently fall back for expired dates', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('./')
  await expect(page).toHaveTitle(/Salah/)
  await expect(page.getByRole('listitem')).toHaveCount(8)
  await page.getByRole('button', { name: 'Настройки' }).click()
  await page.getByRole('button', { name: 'Время намаза' }).click()
  await page.getByLabel('Источник', { exact: true }).selectOption('calculated')
  await page.getByRole('button', { name: 'Расширенные настройки' }).click()
  await page.getByLabel('Профиль', { exact: true }).selectOption('karachi')
  await page.getByRole('button', { name: 'Применить ручной расчёт' }).click()
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click()
  await expect(page.getByRole('listitem')).toHaveCount(7)
  await expect.poll(() => readSavedSetting(page, 'sourcePreferences')).toMatchObject({ mode: 'manual', source: { kind: 'calculated', calculation: { profile: 'karachi' } } })
  await page.reload()
  await expect(page.getByRole('listitem')).toHaveCount(7)
  await page.getByRole('button', { name: 'Настройки' }).click()
  await page.getByRole('button', { name: 'Время намаза' }).click()
  await expect(page.getByLabel('Источник', { exact: true })).toHaveValue('calculated')
  await page.getByRole('button', { name: 'Расширенные настройки' }).click()
  await expect(page.getByLabel('Профиль', { exact: true })).toHaveValue('karachi')
  await page.getByRole('button', { name: '← Назад' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: '/tmp/salah-source-settings.png' })
  await page.getByRole('button', { name: 'Вернуться к автоматическому выбору' }).click()
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click()
  await expect(page.getByRole('listitem')).toHaveCount(8)
  await page.getByLabel('Выбрать дату').fill('2027-01-01')
  await expect(page.getByRole('listitem')).toHaveCount(7)
  await page.getByRole('button', { name: 'Настройки' }).click()
  await page.getByRole('button', { name: 'Время намаза' }).click()
  await page.getByLabel('Источник', { exact: true }).selectOption('dumRt')
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('не покрывает это место или дату')
  await expect(page.getByRole('listitem')).toHaveCount(0)
  expect(errors).toEqual([])
})
