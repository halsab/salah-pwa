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
