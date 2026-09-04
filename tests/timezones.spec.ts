import type { Page } from '@playwright/test'

import { expect, FIXED_BROWSER_TIME, test } from './fixtures'

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
  await page.getByRole('button', { name: 'Найти город или район' }).click()
  await page.getByRole('searchbox').fill('Стамбул')
  await page.getByRole('button', { name: 'Стамбул, Турция' }).click()
  await expect(page.getByRole('button', { name: /Стамбул, Турция · UTC\+3/ })).toBeVisible()

  expect(await page.evaluate(async () => (
    await navigator.permissions.query({ name: 'geolocation' })
  ).state)).toBe('granted')
  const savedChoice = {
    mode: 'calculated',
    source: 'manual',
    coordinates: {
      latitude: 41.0138,
      longitude: 28.9497,
      timeZone: 'Europe/Istanbul',
      accuracy: null,
      timestamp: FIXED_BROWSER_TIME.getTime(),
      name: 'Стамбул, Турция',
      cityId: 745044,
      nameSource: 'geonames',
      source: 'preset',
    },
  }
  await expect.poll(() => readSavedLocationChoice(page)).toEqual(savedChoice)

  await page.reload()

  await expect(page.getByRole('button', { name: /Стамбул, Турция · UTC\+3/ })).toBeVisible()
  await waitForPostMountBoundary(page)
  expect(await getGeolocationObservation(page)).toEqual({
    permissionQueries: 0,
    getCurrentPosition: 0,
    watchPosition: 0,
  })
  expect(await readSavedLocationChoice(page)).toEqual(savedChoice)
  expect(reverseRequests).toBe(0)
})
