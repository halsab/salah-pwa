import { afterEach, describe, expect, it, vi } from 'vitest'
import { openDB } from 'idb'
import { getDeviceTimeZone } from '../domain/locationTime'
import { deleteVaqtProDatabase, getLocationChoice, getSetting,
  getStartupData, clearAppData, saveLocationChoice } from './database'
import { type Result } from '../domain/result'
import type { LocationChoice } from './database'

interface LegacyFixture {
  settings?: ReadonlyArray<{ key: string; value: unknown }>
  day?: Record<string, unknown> & { locationId: string; date: string }
  meta?: unknown
}

async function createLegacyDatabase(version: number, fixture: LegacyFixture = {}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('salah', version)
    request.onerror = () => reject(request.error ?? new Error('Не удалось открыть IndexedDB'))
    request.onupgradeneeded = () => {
      const database = request.result
      database.createObjectStore('days', { keyPath: 'key' })
      database.createObjectStore('meta')
      database.createObjectStore('settings', { keyPath: 'key' })
      if (version >= 9) database.createObjectStore('control')
    }
    request.onsuccess = () => {
      const database = request.result
      const names = ['settings', ...(database.objectStoreNames.contains('days') ? ['days'] : []),
        ...(database.objectStoreNames.contains('meta') ? ['meta'] : []),
        ...(database.objectStoreNames.contains('control') ? ['control'] : [])]
      const transaction = database.transaction(names, 'readwrite')
      for (const setting of fixture.settings ?? []) transaction.objectStore('settings').put(setting)
      if (database.objectStoreNames.contains('control')) transaction.objectStore('control').put(0, 'generation')
      if (fixture.day) transaction.objectStore('days').put({ ...fixture.day, key: `${fixture.day.locationId}:${fixture.day.date}` })
      if (fixture.meta !== undefined) transaction.objectStore('meta').put(fixture.meta, 'current')
      transaction.onabort = () => reject(transaction.error ?? new Error('Не удалось записать legacy IndexedDB'))
      transaction.onerror = () => reject(transaction.error ?? new Error('Не удалось записать legacy IndexedDB'))
      transaction.oncomplete = () => { database.close(); resolve() }
    }
  })
}

async function databaseDetails(): Promise<{ version: number; stores: string[] }> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('salah')
    request.onerror = () => reject(request.error ?? new Error('Не удалось открыть IndexedDB'))
    request.onsuccess = () => {
      const database = request.result
      const result = { version: database.version, stores: Array.from(database.objectStoreNames).sort() }
      database.close()
      resolve(result)
    }
  })
}

function unwrap<Value>(result: Result<Value, unknown>): Value {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('Ожидался успешный результат')
  return result.value
}

afterEach(async () => { vi.unstubAllGlobals(); await deleteVaqtProDatabase() })

describe('calculation-only database', () => {
  it('creates only user settings and control stores on a fresh install', async () => {
    expect(unwrap(await getSetting('appearance'))).toBe('system')
    expect(await databaseDetails()).toEqual({ version: 14, stores: ['control', 'settings'] })
  })

  it('migrates a legacy official locality using the retained catalog, not cached dataset metadata', async () => {
    await createLegacyDatabase(5, {
      day: { locationId: 'kazan', date: '2026-09-01', fajrStart: '02:21' },
      meta: { source: { name: 'legacy', years: [2026] }, locations: [{ id: 'kazan' }] },
      settings: [
        { key: 'locationChoice', value: { mode: 'official', locationId: 'kazan', source: 'manual' } },
        { key: 'calculationSettings', value: { profile: 'dumRt', asrMethod: 'hanafi', highLatitudeRule: 'dumRt', adjustments: { dhuhr: 2 } } },
      ],
    })

    const choice = unwrap(await getLocationChoice())
    expect(choice).toMatchObject({ mode: 'calculated', source: 'manual',
      coordinates: { latitude: 55.7946485, longitude: 49.1115022, timeZone: 'Europe/Moscow' },
      place: { id: 'locality:kazan', name: 'Казань', selection: 'city' } })
    expect(unwrap(await getSetting('sourcePreferences'))).toMatchObject({ mode: 'manual', source: { kind: 'calculated', calculation: {
      profile: 'tatarstan', overrides: { highLatitudeRule: 'tatarstan', adjustments: { dhuhr: 2 } },
    } } })
    expect(await databaseDetails()).toEqual({ version: 14, stores: ['control', 'settings'] })
  })

  it('migrates a legacy locality without metadata while preserving its canonical coordinates', async () => {
    await createLegacyDatabase(5, { settings: [{ key: 'locationChoice', value: {
      mode: 'official', locationId: 'nizhnekamsk', source: 'manual',
    } }] })

    expect(unwrap(await getLocationChoice())).toMatchObject({ mode: 'calculated', source: 'manual',
      coordinates: { latitude: 55.6412879, longitude: 51.8160376, timeZone: 'Europe/Moscow' },
      place: { id: 'locality:nizhnekamsk', name: 'Нижнекамск' } })
    expect(await databaseDetails()).toEqual({ version: 14, stores: ['control', 'settings'] })
  })

  it('migrates legacy official source drafts and removes the hidden provider pin', async () => {
    await createLegacyDatabase(12, { settings: [
      { key: 'locationChoice', value: { mode: 'calculated', coordinates: { latitude: 55.75, longitude: 37.62,
        accuracy: null, timestamp: 10, timeZone: 'Europe/Moscow', source: 'preset' }, source: 'manual' } },
      { key: 'sourcePreferences', value: { mode: 'automatic', calculationDraft: { profile: 'dumRt', overrides: { asrMethod: 'hanafi' } },
        manualSourceDraft: { kind: 'official', provider: 'dumRt' } } },
    ] })

    expect(unwrap(await getSetting('sourcePreferences'))).toEqual({ mode: 'automatic', calculationDraft: {
      profile: 'tatarstan', overrides: { asrMethod: 'hanafi' },
    }, manualSourceDraft: { kind: 'calculated', calculation: { profile: 'tatarstan', overrides: { asrMethod: 'hanafi' } } } })
    expect(unwrap(await getLocationChoice())).toMatchObject({ mode: 'calculated', place: { latitude: 55.75, longitude: 37.62 } })
    expect(await databaseDetails()).toEqual({ version: 14, stores: ['control', 'settings'] })
  })

  it('migrates version 13 official choices and settings before dropping cached tables', async () => {
    await createLegacyDatabase(13, {
      day: { locationId: 'kazan', date: '2026-09-01', fajrStart: '02:21' },
      meta: { source: { name: 'legacy', years: [2026] } },
      settings: [
        { key: 'locationChoice', value: { mode: 'official', locationId: 'nizhnekamsk', source: 'manual' } },
        { key: 'sourcePreferences', value: { mode: 'manual', source: { kind: 'official', provider: 'dumRt' },
          calculationDraft: { profile: 'karachi', overrides: { asrMethod: 'hanafi', adjustments: { dhuhr: 3 } } } } },
      ],
    })

    expect(unwrap(await getLocationChoice())).toMatchObject({ mode: 'calculated', source: 'manual',
      coordinates: { latitude: 55.6412879, longitude: 51.8160376, timeZone: 'Europe/Moscow' },
      place: { id: 'locality:nizhnekamsk', name: 'Нижнекамск', selection: 'city' } })
    expect(unwrap(await getSetting('sourcePreferences'))).toMatchObject({ mode: 'manual', source: { kind: 'calculated', calculation: {
      profile: 'tatarstan', overrides: { asrMethod: 'hanafi', adjustments: { dhuhr: 3 } },
    } } })
    expect(await databaseDetails()).toEqual({ version: 14, stores: ['control', 'settings'] })
  })

  it.each([
    ['dumRt', 'dumRt', 'tatarstan', 'tatarstan'],
    ['dumRf', 'nearestDay', 'russia', 'nearestDay'],
  ] as const)('renames persisted profile %s and retains its high-latitude override', async (profile, rule, expected, expectedRule) => {
    await createLegacyDatabase(7, { settings: [
      { key: 'locationChoice', value: { mode: 'calculated', source: 'manual', coordinates: {
        latitude: 55, longitude: 37, accuracy: null, timestamp: 0, timeZone: 'Europe/Moscow',
      } } },
      { key: 'calculationSettings', value: { profile, asrMethod: 'standard', highLatitudeRule: rule } },
    ] })

    expect(unwrap(await getSetting('sourcePreferences'))).toMatchObject({ mode: 'manual', source: { kind: 'calculated', calculation: {
      profile: expected, overrides: { highLatitudeRule: expectedRule },
    } } })
    expect(unwrap(await getSetting('calculationSettings'))).toMatchObject({ profile: expected, highLatitudeRule: expectedRule })
  })

  it('migrates old flat GPS settings without losing the point or device-timezone fallback', async () => {
    const coordinates = { latitude: 55.7558, longitude: 37.6173, accuracy: 18, timestamp: 123,
      name: 'Сохранённое место', source: 'gps' }
    await createLegacyDatabase(4, { settings: [
      { key: 'calculatedLocation', value: coordinates }, { key: 'locationMode', value: 'calculated' },
    ] })

    expect(unwrap(await getLocationChoice())).toMatchObject({ mode: 'calculated', source: 'automatic',
      coordinates: { ...coordinates, timeZone: getDeviceTimeZone() },
      place: { latitude: coordinates.latitude, longitude: coordinates.longitude, timeZone: getDeviceTimeZone() } })
  })

  it('migrates v4 legacy official IDs to the calculated locality and stores a canonical place', async () => {
    await createLegacyDatabase(4, { settings: [
      { key: 'locationId', value: 'naberezhnye-chelny' }, { key: 'locationMode', value: 'official' },
    ] })
    expect(unwrap(await getLocationChoice())).toMatchObject({ mode: 'calculated', source: 'manual',
      place: { id: 'locality:naberezhnye-chelny', name: 'Набережные Челны' } })
  })

  it('adds the historical implicit Kazan default only before a prior reset', async () => {
    await createLegacyDatabase(9)
    expect(unwrap(await getLocationChoice())).toMatchObject({ mode: 'calculated', source: 'default', place: { id: 'locality:kazan' } })
    expect(unwrap(await getSetting('recentPlaces'))).toEqual([])
    expect(unwrap(await getSetting('calendarPreferences'))).toEqual({ calendar: 'gregorian', correction: 0 })

    await deleteVaqtProDatabase()
    await createLegacyDatabase(9)
    const db = await openDB('salah')
    await db.put('control', 2, 'generation')
    db.close()
    expect(unwrap(await getLocationChoice())).toBeUndefined()
  })

  it('rejects attempts to persist a legacy official source choice', async () => {
    const invalid = { mode: 'official', locationId: 'kazan', source: 'manual' } as unknown as LocationChoice
    expect(await saveLocationChoice(invalid)).toMatchObject({ ok: false, error: { kind: 'data', reason: 'invalid' } })
    expect(unwrap(await getLocationChoice())).toBeUndefined()
  })

  it('clears user settings atomically and increments the session generation', async () => {
    const choice: LocationChoice = { mode: 'calculated', coordinates: {
      latitude: 55.79, longitude: 49.12, accuracy: null, timestamp: 1, timeZone: 'Europe/Moscow', name: 'Казань', source: 'preset',
    }, source: 'manual' }
    expect(await saveLocationChoice(choice)).toMatchObject({ ok: true })
    const before = unwrap(await getStartupData())
    expect(before.choice).toMatchObject({ mode: 'calculated' })
    expect((await clearAppData()).ok).toBe(true)
    const after = unwrap(await getStartupData())
    expect(after).toMatchObject({ generation: before.generation + 1, choice: undefined })
  })

  it('returns typed storage failures when IndexedDB cannot be opened', async () => {
    vi.stubGlobal('indexedDB', { open: () => { throw new Error('IndexedDB disabled') } })
    expect(await getStartupData()).toEqual({ ok: false, error: { kind: 'storage', reason: 'unavailable' } })
  })
})
