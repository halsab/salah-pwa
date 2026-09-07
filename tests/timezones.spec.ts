import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'

test.use({ timezoneId: 'America/Los_Angeles' })

interface GeolocationObservation {
  permissionQueries: number
  getCurrentPosition: number
  watchPosition: number
}

async function observeGeolocation(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const calls: GeolocationObservation = {
      permissionQueries: 0,
      getCurrentPosition: 0,
      watchPosition: 0,
    }
    Object.defineProperty(globalThis, '__salahGeolocationCalls', {
      configurable: true,
      value: calls,
    })

    const geolocation = navigator.geolocation
    const originalGetCurrentPosition = geolocation.getCurrentPosition.bind(geolocation)
    const originalWatchPosition = geolocation.watchPosition.bind(geolocation)
    Object.defineProperty(geolocation, 'getCurrentPosition', {
      configurable: true,
      value: (
        success: PositionCallback,
        error?: PositionErrorCallback | null,
        options?: PositionOptions,
      ) => {
        calls.getCurrentPosition += 1
        originalGetCurrentPosition(success, error, options)
      },
    })
    Object.defineProperty(geolocation, 'watchPosition', {
      configurable: true,
      value: (
        success: PositionCallback,
        error?: PositionErrorCallback | null,
        options?: PositionOptions,
      ) => {
        calls.watchPosition += 1
        return originalWatchPosition(success, error, options)
      },
    })

    const permissions = navigator.permissions
    const originalQuery = permissions.query.bind(permissions)
    Object.defineProperty(permissions, 'query', {
      configurable: true,
      value: (descriptor: PermissionDescriptor) => {
        if (descriptor.name === 'geolocation') calls.permissionQueries += 1
        return originalQuery(descriptor)
      },
    })
  })
}

async function getGeolocationObservation(
  page: Page,
): Promise<GeolocationObservation> {
  return page.evaluate(() => {
    const calls = (globalThis as typeof globalThis & {
      __salahGeolocationCalls?: GeolocationObservation
    }).__salahGeolocationCalls
    if (!calls) throw new Error('Счётчики геолокации не установлены')
    return { ...calls }
  })
}

async function readSavedLocationChoice(page: Page): Promise<unknown> {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const openRequest = indexedDB.open('salah')
    openRequest.onerror = () => reject(
      openRequest.error ?? new Error('Не удалось открыть IndexedDB'),
    )
    openRequest.onsuccess = () => {
      const database = openRequest.result
      const transaction = database.transaction('settings', 'readonly')
      const request = transaction.objectStore('settings').get('locationChoice')
      let value: unknown

      request.onsuccess = () => {
        value = (request.result as { value?: unknown } | undefined)?.value
      }
      transaction.oncomplete = () => {
        database.close()
        resolve(value)
      }
      transaction.onerror = () => {
        database.close()
        reject(transaction.error ?? new Error('Ошибка чтения IndexedDB'))
      }
      transaction.onabort = () => {
        database.close()
        reject(transaction.error ?? new Error('Чтение IndexedDB отменено'))
      }
    }
  }))
}

async function waitForPostMountBoundary(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await Promise.resolve()
  })
}

test('дата расписания следует часовому поясу города, а не устройства', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-31T21:30:00.000Z'))
  await page.goto('./')

  const deviceDate = await page.evaluate(() => {
    const now = new Date()
    return [now.getFullYear(), now.getMonth() + 1, now.getDate()]
      .map((value) => String(value).padStart(2, '0'))
      .join('-')
  })
  expect(deviceDate).toBe('2026-08-31')
  await expect(page.getByLabel('Выбрать дату')).toHaveValue('2026-09-01')
  await expect(page.getByRole('button', { name: /Казань · UTC\+3/ })).toBeVisible()
})

test('ручной город сохраняется при доступной геопозиции на следующем запуске', async ({
  context,
  page,
}) => {
  await observeGeolocation(page)
  let reverseRequests = 0
  await page.route('https://nominatim.openstreetmap.org/**', (route) => {
    reverseRequests += 1
    return route.abort()
  })
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 55.7558, longitude: 37.6173 })

  await page.goto('./')
  await page.getByRole('button', { name: /Казань/ }).click()
  await page.locator('.official-country-group summary').click()
  await page.getByRole('button', { name: 'Набережные Челны' }).click()
  await expect(page.getByRole('button', { name: /Набережные Челны · UTC\+3/ })).toBeVisible()

  expect(await page.evaluate(async () => (
    await navigator.permissions.query({ name: 'geolocation' })
  ).state)).toBe('granted')
  const savedChoice = {
    mode: 'official',
    locationId: 'naberezhnye-chelny',
    source: 'manual',
  }
  await expect.poll(() => readSavedLocationChoice(page)).toMatchObject(savedChoice)

  await page.reload()

  await expect(page.getByRole('button', { name: /Набережные Челны · UTC\+3/ })).toBeVisible()
  await waitForPostMountBoundary(page)
  expect(await getGeolocationObservation(page)).toEqual({
    permissionQueries: 0,
    getCurrentPosition: 0,
    watchPosition: 0,
  })
  expect(await readSavedLocationChoice(page)).toMatchObject(savedChoice)
  expect(reverseRequests).toBe(0)
})

test('спорная строка Апастово сохраняет моменты, но не включает зенит в таймер намаза', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-02-07T08:59:00.000Z'))
  await page.goto('./')
  await page.getByRole('button', { name: /Казань/ }).click()
  await page.locator('.official-country-group summary').click()
  await page.getByRole('button', { name: 'Апастово', exact: true }).click()
  await expect(page.getByRole('button', { name: /Апастово · UTC\+3/ })).toBeVisible()
  await expect(page.getByRole('timer')).toHaveAccessibleName('До зухра, осталось 00:01:00')

  await page.clock.setFixedTime(new Date('2026-02-07T09:00:00.000Z'))
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')))
  await expect(page.locator('.next-name')).toHaveText('Аср')
  await expect(page.getByRole('timer')).toHaveAccessibleName(/До асра/)

  await page.clock.setFixedTime(new Date('2026-02-07T09:01:00.000Z'))
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')))
  await expect(page.locator('.next-name')).toHaveText('Аср')
  await expect(page.locator('.prayer-row[data-active] .prayer-name')).toHaveText('Аср')
})

test('около полуночи сохраняет поздний сухур источника с пояснением и считает до подтверждённого события', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-05-04T21:10:00.000Z'))
  await page.goto('./')
  await expect(page.getByLabel('Выбрать дату')).toHaveValue('2026-05-05')
  await expect(page.getByRole('list', { name: 'Расписание дня' }).getByText('23:54')).toBeVisible()
  await page.getByRole('button', { name: /Официальное расписание · ДУМ РТ/ }).click()
  await expect(page.getByText(/Дата завершения сухура 23:54.*не уточнена/)).toBeVisible()
  await page.getByRole('button', { name: 'Закрыть' }).click()
  await expect(page.locator('.next-name')).toHaveText('Утренний намаз в мечетях')
  await expect(page.getByRole('timer')).toHaveAccessibleName('До утреннего в мечети, осталось 02:12:00')
})

test('manual timezone, DST and automatic reset preserve place and calculation settings', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-03-29T01:30:00Z'))
  await page.goto('./')
  await page.getByRole('button', { name: /Казань/ }).click()
  await page.getByRole('button', { name: 'Найти город или район' }).click()
  await page.getByRole('searchbox').fill('Берлин')
  await page.getByRole('button', { name: 'Берлин, Берлин, Германия', exact: true }).click()
  await expect(page.getByRole('button', { name: /Берлин.*UTC\+2/ })).toBeVisible()
  await page.getByRole('button', { name: /Берлин/ }).click()
  await page.getByText('Сведения о месте и часовой пояс', { exact: true }).click()
  await expect(page.getByText(/Часовой пояс: Europe\/Berlin · из данных/)).toBeVisible()
  await page.getByLabel('Часовой пояс IANA').fill('America/New_York')
  await page.getByRole('button', { name: 'Применить часовой пояс', exact: true }).click()
  await expect(page.getByText(/Часовой пояс: America\/New_York · выбрана вручную/)).toBeVisible()
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click()
  await expect(page.getByLabel('Выбрать дату')).toHaveValue('2026-03-28')
  await expect.poll(() => readSavedLocationChoice(page)).toMatchObject({ place: { timeZoneOverride: { id: 'America/New_York', source: 'user' } } })
  await page.reload()
  await page.getByRole('button', { name: /Берлин/ }).click()
  await page.getByText('Сведения о месте и часовой пояс', { exact: true }).click()
  await expect(page.getByLabel('Часовой пояс IANA')).toHaveValue('America/New_York')
  await page.getByRole('button', { name: 'Определять часовой пояс автоматически' }).click()
  await expect(page.getByText(/Часовой пояс: Europe\/Berlin · из данных/)).toBeVisible()
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click()
  await expect(page.getByLabel('Выбрать дату')).toHaveValue('2026-03-29')
})

test('official table retains provider instants with a manual place timezone', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-04T09:30:00Z'))
  await page.goto('./')
  const timer = await page.getByRole('timer').getAttribute('aria-label')
  if (!timer) throw new Error('Таймер не отображается')
  const times = await page.locator('.prayer-time').allTextContents()
  expect(times).toHaveLength(8)
  await page.getByRole('button', { name: /Казань/ }).click()
  await page.getByText('Сведения о месте и часовой пояс', { exact: true }).click()
  await page.getByLabel('Часовой пояс IANA').fill('America/New_York')
  await page.getByRole('button', { name: 'Применить часовой пояс', exact: true }).click()
  await expect(page.getByText(/Её часы и календарная дата показаны в Europe\/Moscow/)).toBeVisible()
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click()
  await expect(page.getByRole('timer')).toHaveAttribute('aria-label', timer)
  expect(await page.locator('.prayer-time').allTextContents()).toEqual(times)
  await expect(page.getByLabel('Выбрать дату')).toHaveValue('2026-09-04')
})
