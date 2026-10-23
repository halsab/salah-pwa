import { choosePlace, expectSchedule, readSavedSetting, expect, test } from './fixtures'

test.use({ timezoneId: 'Europe/Moscow' })

test('upgrades the published v12 official IndexedDB without reviving official prayer data', async ({ page, context }) => {
  const officialRequests: string[] = []
  page.on('request', request => {
    if (request.url().includes('/data/prayer-times-current.json') || request.url().includes('/data/prayer-times-manifest.json')) officialRequests.push(request.url())
  })

  // Load a static, script-free resource on the app origin before seeding the
  // actual previously published database schema. No React startup runs yet.
  await page.goto('./manifest.webmanifest')
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('salah', 12)
      request.onupgradeneeded = () => {
        const db = request.result
        db.createObjectStore('settings', { keyPath: 'key' })
        db.createObjectStore('control')
        db.createObjectStore('days', { keyPath: 'key' })
        db.createObjectStore('meta')
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'))
    })
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(['settings', 'control', 'days', 'meta'], 'readwrite')
        for (const [key, value] of Object.entries({
          locationChoice: { mode: 'official', locationId: 'agriz', source: 'manual' },
          sourcePreferences: { mode: 'manual', source: { kind: 'official', provider: 'dumRt' } },
          calculationSettings: { profile: 'dumRt', asrMethod: 'hanafi', highLatitudeRule: 'dumRt' },
          recentPlaces: [{ id: 'locality:agriz', selection: 'official' }],
          recentPlacesMigrated: true,
          appearance: 'dark',
          themeFamily: 'classic',
          languagePreference: 'ru',
          calendarPreferences: { calendar: 'gregorian', correction: 1 },
          fastingMode: { manualEnabled: true },
        })) tx.objectStore('settings').put({ key, value })
        tx.objectStore('control').put(0, 'generation')
        tx.objectStore('days').put({
          key: 'agriz:2026-09-04', locationId: 'agriz', date: '2026-09-04',
          fajrStart: '04:01', dhuhr: '11:45', maghrib: '18:45',
        })
        tx.objectStore('meta').put({ provider: 'dumRt', version: 'legacy-official-2026' }, 'current')
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error ?? new Error('Failed to seed legacy IndexedDB'))
        tx.onabort = () => reject(tx.error ?? new Error('Failed to seed legacy IndexedDB'))
      })
    } finally {
      database.close()
    }
    localStorage.setItem('salah:fast-schedule:v1', '{"legacy":"official"}')
    localStorage.setItem('salah:fast-schedule-context:v1', '{"legacy":"official"}')
  })

  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Выберите место' })).toBeVisible()
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('salah')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'))
    })
    try { return { version: db.version, stores: Array.from(db.objectStoreNames).sort() } }
    finally { db.close() }
  })).toEqual({ version: 15, stores: ['control', 'settings'] })

  for (const key of ['locationChoice', 'sourcePreferences', 'calculationSettings']) {
    expect(await readSavedSetting(page, key)).toBeUndefined()
  }
  // Initial hydration is allowed to create an empty, canonical new-version
  // place history immediately after resetting the obsolete history.
  expect(await readSavedSetting(page, 'recentPlaces')).toEqual([])
  expect([undefined, true]).toContain(await readSavedSetting(page, 'recentPlacesMigrated'))
  expect(await readSavedSetting(page, 'appearance')).toBe('dark')
  expect(await readSavedSetting(page, 'languagePreference')).toBe('ru')
  expect(await readSavedSetting(page, 'calendarPreferences')).toEqual({ calendar: 'gregorian', correction: 1 })
  expect(await readSavedSetting(page, 'fastingMode')).toEqual({ manualEnabled: true })
  expect(await page.evaluate(() => localStorage.getItem('salah:fast-schedule:v1'))).toBeNull()
  expect(officialRequests).toEqual([])

  await choosePlace(page, 'Агрыз', 'Агрыз Татарстан')
  await expectSchedule(page, 7)
  const dhuhr = page.getByRole('list', { name: 'Расписание дня' }).getByRole('listitem').filter({ hasText: 'Зухр' })
  await expect(dhuhr).toContainText('11:45')
  await expect.poll(() => readSavedSetting(page, 'locationChoice')).toMatchObject({
    mode: 'calculated', place: { id: 'geonames:583983', selection: 'city' },
  })

  await page.reload()
  await expectSchedule(page, 7)
  await expect(dhuhr).toContainText('11:45')
  await expect.poll(() => readSavedSetting(page, 'locationChoice')).toMatchObject({
    mode: 'calculated', place: { id: 'geonames:583983', selection: 'city' },
  })
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  await context.setOffline(true)
  try {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expectSchedule(page, 7)
    await expect(dhuhr).toContainText('11:45')
  } finally {
    await context.setOffline(false)
  }
  expect(officialRequests).toEqual([])
})

test('unverified GPS near a fixed-time city still uses generic Dhuhr', async ({ page, context }) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 55.6379, longitude: 51.8150, accuracy: 10 })
  await page.goto('./')
  await choosePlace(page, 'Нижнекамск', 'Нижнекамск Татарстан')
  await expectSchedule(page, 7)
  const dhuhr = page.getByRole('list', { name: 'Расписание дня' }).getByRole('listitem').filter({ hasText: 'Зухр' })
  await expect(dhuhr).toContainText('11:50')
  await page.locator('#home-location').click()
  await page.getByRole('button', { name: 'По геопозиции' }).click()
  const accept = page.getByRole('button', { name: 'Использовать эту точку' })
  if (await accept.isVisible()) await accept.click()
  await expect.poll(() => readSavedSetting(page, 'locationChoice')).toMatchObject({
    mode: 'calculated', place: { selection: 'gps', latitude: 55.6379, longitude: 51.8150 },
  })
  await expectSchedule(page, 7)
  await expect(dhuhr).toContainText('12:00')
})
