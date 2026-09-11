import type { Page } from '@playwright/test'

import { back, choosePlace, expectSchedule, openSource, readSavedSetting, writeSavedSetting, expect, test } from './fixtures'

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
  await choosePlace(page)

  const deviceDate = await page.evaluate(() => {
    const now = new Date()
    return [now.getFullYear(), now.getMonth() + 1, now.getDate()]
      .map((value) => String(value).padStart(2, '0'))
      .join('-')
  })
  expect(deviceDate).toBe('2026-08-31')
  await expect(page.locator('#home-date time')).toHaveAttribute('datetime', '2026-09-01')
  await expect(page.getByRole('button', { name: /Казань/ })).toBeVisible()
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
  await choosePlace(page)
  await choosePlace(page, 'Набережные Челны', /Набережные Челны.*ДУМ РТ/)
  await expect(page.getByRole('button', { name: /Набережные Челны/ })).toBeVisible()

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

  await expect(page.getByRole('button', { name: /Набережные Челны/ })).toBeVisible()
  await waitForPostMountBoundary(page)
  expect(await getGeolocationObservation(page)).toEqual({
    permissionQueries: 0,
    getCurrentPosition: 0,
    watchPosition: 0,
  })
  expect(await readSavedLocationChoice(page)).toMatchObject(savedChoice)
  expect(reverseRequests).toBe(0)
})

test('спорная строка Апастово сохраняет моменты и учитывает зенит после Зухра', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-02-07T08:59:00.000Z'))
  await page.goto('./')
  await choosePlace(page)
  await choosePlace(page, 'Апастово', /Апастово.*ДУМ РТ/)
  await expect(page.getByRole('button', { name: /Апастово/ })).toBeVisible()
  await expect(page.getByRole('timer')).toHaveAccessibleName('До Зухра, осталось 1 мин')

  await page.clock.setFixedTime(new Date('2026-02-07T09:00:00.000Z'))
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')))
  await expect(page.locator('[aria-current="true"] .event-name')).toContainText('Зухр')
  await expect(page.getByRole('timer')).toHaveAccessibleName('До зенита, осталось 1 мин')

  await page.clock.setFixedTime(new Date('2026-02-07T09:01:00.000Z'))
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')))
  await expectSchedule(page)
  await expect(page.locator('[aria-current="true"] .event-name')).toContainText('Зенит')
  await expect(page.getByRole('timer')).toHaveAccessibleName(/До Асра/)
})

test('около полуночи показывает календарную дату сухура накануне дня поста и считает до джамаата', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-05-04T21:10:00.000Z'))
  await page.goto('./')
  await choosePlace(page)
  await expect(page.locator('#home-date time')).toHaveAttribute('datetime', '2026-05-05')
  await expectSchedule(page)
  await expect(page.getByRole('list', { name: 'Расписание дня' }).getByText('23:54')).toBeVisible()
  await expect(page.getByText('23:54', { exact: true })).toHaveAttribute('datetime', '2026-05-04T20:54:00.000Z')
  await openSource(page)
  await page.getByRole('button', { name: 'О расписании' }).click()
  await expect(page.getByText('Сухур до 23:54 — понедельник, 4 мая, накануне дня поста.')).toBeVisible()
  await back(page)
  await back(page)
  await back(page)
  await expect(page.getByRole('timer')).toHaveAccessibleName('До Фаджра в мечети, осталось 2 ч 12 мин')
})

test('сохранённая ручная зона переживает редизайн; DST города не подменяется зоной устройства', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-03-29T01:30:00Z'))
  await page.goto('./')
  await choosePlace(page, 'Берлин', 'Берлин, Берлин, Германия')
  await expect(page.locator('#home-date time')).toHaveAttribute('datetime', '2026-03-29')
  const choice = await readSavedSetting(page, 'locationChoice') as { place: Record<string, unknown> }
  await writeSavedSetting(page, 'locationChoice', { ...choice, place: { ...choice.place, timeZoneOverride: { id: 'America/New_York', source: 'user' } } })
  await page.reload()
  await expect(page.locator('#home-date time')).toHaveAttribute('datetime', '2026-03-28')
  await expectSchedule(page, 7)
  const times = await page.locator('.event-row time').allTextContents()
  await page.reload()
  await expectSchedule(page, 7)
  expect(await page.locator('.event-row time').allTextContents()).toEqual(times)
  expect(await readSavedSetting(page, 'locationChoice')).toMatchObject({ place: { timeZoneOverride: { id: 'America/New_York', source: 'user' } } })
})

test('официальная таблица сохраняет моменты при прежней ручной зоне места', async ({ page }) => {
  await page.goto('./')
  await choosePlace(page)
  const timer = await page.getByRole('timer').getAttribute('aria-label')
  await expectSchedule(page)
  const times = await page.locator('.event-row time').allTextContents()
  const choice = await readSavedSetting(page, 'locationChoice') as Record<string, unknown>
  await writeSavedSetting(page, 'locationChoice', { ...choice, timeZoneOverride: { id: 'America/New_York', source: 'user' } })
  await page.reload()
  await expect(page.getByRole('timer')).toHaveAttribute('aria-label', timer ?? '')
  await expect(page.locator('#home-date time')).toHaveAttribute('datetime', '2026-09-04')
  await expectSchedule(page)
  expect(await page.locator('.event-row time').allTextContents()).toEqual(times)
})
