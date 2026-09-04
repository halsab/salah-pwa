import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Result } from '../domain/result'
import type { PrayerDataset } from '../domain/types'
import {
  deleteSalahDatabase,
  getDatasetMeta,
  getLocationChoice,
  getPrayerDay,
  replaceDataset,
  saveLocationChoice,
  type LocationChoice,
} from './database'

async function createLegacyVersion4Database(
  settings: ReadonlyArray<{ key: string; value: unknown }>,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('salah', 4)
    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => {
      const database = request.result
      database.createObjectStore('days', { keyPath: 'key' })
      database.createObjectStore('meta')
      database.createObjectStore('settings', { keyPath: 'key' })
    }
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('settings', 'readwrite')
      const store = transaction.objectStore('settings')
      for (const setting of settings) store.put(setting)
      transaction.onerror = () => reject(transaction.error)
      transaction.oncomplete = () => {
        database.close()
        resolve()
      }
    }
  })
}

async function getDatabaseVersion(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const request = indexedDB.open('salah')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const version = database.version
      database.close()
      resolve(version)
    }
  })
}

function unwrap<Value>(result: Result<Value, unknown>): Value {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('Ожидался успешный результат')
  return result.value
}

const dataset: PrayerDataset = {
  schemaVersion: 2,
  source: {
    name: 'ДУМ Республики Татарстан',
    url: 'https://dumrt.ru/ru/help-info/prayertime/',
    updatedAt: '2025-12-27T10:49:04.000Z',
    years: [2026],
  },
  locations: [
    { id: 'kazan', name: 'Казань', latitude: 55.7946, longitude: 49.1115 },
  ],
  days: [
    {
      locationId: 'kazan',
      date: '2026-09-01',
      suhurEnd: '02:21',
      fajrJamaat: '03:17',
      sunrise: '04:48',
      zenith: '11:44',
      dhuhr: '12:00',
      asr: '16:24',
      maghrib: '18:39',
      isha: '20:33',
    },
  ],
}

afterEach(async () => {
  vi.unstubAllGlobals()
  await deleteSalahDatabase()
})

describe('database', () => {
  it('атомарно сохраняет набор данных и читает день по городу и дате', async () => {
    unwrap(await replaceDataset(dataset))

    expect(unwrap(await getPrayerDay('kazan', '2026-09-01'))).toEqual(
      dataset.days[0],
    )
    expect(unwrap(await getDatasetMeta())).toEqual({
      schemaVersion: dataset.schemaVersion,
      source: dataset.source,
      locations: dataset.locations,
    })
  })

  it('сохраняет полный выбор локации одной записью', async () => {
    const choice: LocationChoice = {
      mode: 'official',
      locationId: 'kazan',
      source: 'manual',
    }

    unwrap(await saveLocationChoice(choice))

    expect(unwrap(await getLocationChoice())).toEqual(choice)
  })

  it('мигрирует GPS-выбор v4 в автоматический calculated-выбор v5', async () => {
    const legacyCoordinates = {
      latitude: 55.7558,
      longitude: 37.6173,
      accuracy: 18,
      timestamp: 1_788_265_600_000,
      name: 'Москва, Россия',
      source: 'gps',
    }
    await createLegacyVersion4Database([
      { key: 'calculatedLocation', value: legacyCoordinates },
      { key: 'locationMode', value: 'calculated' },
      { key: 'locationId', value: 'kazan' },
    ])

    expect(unwrap(await getLocationChoice())).toEqual({
      mode: 'calculated',
      coordinates: legacyCoordinates,
      source: 'automatic',
    })
    expect(await getDatabaseVersion()).toBe(5)
  })

  it('мигрирует preset-выбор v4 в ручной calculated-выбор', async () => {
    const legacyCoordinates = {
      latitude: 41.0082,
      longitude: 28.9784,
      accuracy: null,
      timestamp: 1_788_265_600_000,
      source: 'preset',
      timeZone: 'Europe/Istanbul',
    }
    await createLegacyVersion4Database([
      { key: 'calculatedLocation', value: legacyCoordinates },
      { key: 'locationMode', value: 'calculated' },
    ])

    expect(unwrap(await getLocationChoice())).toEqual({
      mode: 'calculated',
      coordinates: legacyCoordinates,
      source: 'manual',
    })
  })

  it('мигрирует каждый legacy official-выбор как ручной', async () => {
    await createLegacyVersion4Database([
      { key: 'locationId', value: 'naberezhnye-chelny' },
      { key: 'locationMode', value: 'official' },
    ])

    expect(unwrap(await getLocationChoice())).toEqual({
      mode: 'official',
      locationId: 'naberezhnye-chelny',
      source: 'manual',
    })
  })

  it('не создаёт сохранённый выбор, если legacy-выбора не было', async () => {
    await createLegacyVersion4Database([])

    expect(unwrap(await getLocationChoice())).toBeUndefined()
    expect(await getDatabaseVersion()).toBe(5)
  })

  it('возвращает типизированную ошибку недоступного IndexedDB', async () => {
    vi.stubGlobal('indexedDB', {
      open: () => {
        throw new Error('IndexedDB disabled')
      },
    })

    expect(await getDatasetMeta()).toEqual({
      ok: false,
      error: { kind: 'storage', reason: 'unavailable' },
    })
  })
})
