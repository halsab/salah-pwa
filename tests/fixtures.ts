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

export async function back(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Назад', exact: true }).click()
  // Возврат истории завершается асинхронно; фокус означает готовность следующего перехода.
  await expect.poll(() => page.evaluate(() => document.activeElement?.matches('button, input, select, a'))).toBe(true)
}

export async function chooseDate(page: import('@playwright/test').Page, date: string) {
  const [year, month, day] = date.split('-').map(Number)
  await page.getByRole('button', { name: 'Выбрать дату' }).click()
  await page.getByRole('combobox', { name: 'Календарь' }).selectOption('gregorian')
  await page.getByRole('combobox', { name: 'Год' }).selectOption(String(year))
  await page.getByRole('combobox', { name: 'Месяц' }).selectOption(String(month))
  await page.getByRole('combobox', { name: 'День' }).selectOption(String(day))
  await back(page)
  await expect(page.getByRole('button', { name: 'Выбрать дату' })).toBeFocused()
}

export async function openSource(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Настройки', exact: true }).click()
  await page.getByRole('button', { name: /^Расписание/ }).click()
}

export async function setSource(page: import('@playwright/test').Page, name: 'Автоматически' | 'Таблица ДУМ РТ' | 'Ручной расчёт') {
  await page.getByRole('button', { name: /^Способ/ }).click()
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click()
  await expect(page.getByRole('button', { name: /^Способ/ })).toBeFocused()
}

export async function openReset(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Настройки', exact: true }).click()
  await page.getByRole('button', { name: 'Данные и конфиденциальность', exact: true }).click()
  await page.getByRole('button', { name: 'Удалить данные', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Удаление данных', exact: true })).toBeVisible()
}

export async function writeSavedSetting(page: import('@playwright/test').Page, key: string, value: unknown) {
  await page.evaluate(({ key, value }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('salah')
    request.onerror = () => reject(request.error ?? new Error('Не удалось открыть IndexedDB'))
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('settings', 'readwrite')
      transaction.objectStore('settings').put({ key, value })
      transaction.oncomplete = () => { database.close(); resolve() }
      transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('Запись отменена')) }
    }
  }), { key, value })
}
