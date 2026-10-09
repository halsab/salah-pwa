import { expect, test as base } from '@playwright/test'

export const FIXED_BROWSER_TIME = new Date('2026-09-04T09:30:00.000Z')

export const test = base.extend<{ deterministicClock: true }>({
  deterministicClock: [async ({ page }, use) => {
    await page.clock.setFixedTime(FIXED_BROWSER_TIME)
    await use(true)
  }, { auto: true }],
})

export { expect }

export async function readSavedSetting(page: import('@playwright/test').Page, key: string): Promise<unknown> {
  return page.evaluate(settingKey => new Promise<unknown>((resolve, reject) => {
    const request = indexedDB.open('salah')
    request.onerror = () => reject(request.error ?? new Error('Не удалось открыть IndexedDB'))
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('settings', 'readonly')
      const value = transaction.objectStore('settings').get(settingKey)
      transaction.oncomplete = () => { database.close(); resolve((value.result as { value?: unknown } | undefined)?.value) }
      transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('Чтение отменено')) }
    }
  }), key)
}

export async function choosePlace(page: import('@playwright/test').Page, query = 'Казань', name: string | RegExp = /Казань.*ДУМ РТ/) {
  const search = page.getByRole('button', { name: 'Найти город', exact: true })
  await expect(search.or(page.locator('#home-location'))).toBeVisible()
  if (!await search.isVisible()) await page.locator('#home-location').click()
  await search.click()
  await page.getByRole('searchbox').fill(query)
  await page.getByRole('button', { name, exact: typeof name === 'string' }).click()
  await expect(page.getByRole('region', { name: 'Главная', exact: true })).toBeVisible()
  await expect(page.getByRole('timer')).toBeVisible()
}

export async function expectSchedule(page: import('@playwright/test').Page, count = 8) {
  await expect(page.getByRole('region', { name: 'Главная', exact: true })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Расписание дня' }).getByRole('listitem')).toHaveCount(count)
}
