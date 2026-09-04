import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Result } from '../domain/result'
import type { PrayerDataset } from '../domain/types'
import {
  deleteSalahDatabase,
  getDatasetMeta,
  getLocationChoice,
  getPrayerDay,
  getSetting,
  replaceDataset,
  saveLocationChoice,
  type DatasetIdentity,
  type LocationChoice,
} from './database'

async function createLegacyVersion4Database(
  settings: ReadonlyArray<{ key: string; value: unknown }>,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('salah', 4)
    request.onerror = () => reject(request.error ?? new Error('Не удалось открыть IndexedDB'))
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
      transaction.onerror = () => reject(
        transaction.error ?? new Error('Не удалось записать IndexedDB'),
      )
      transaction.oncomplete = () => {
        database.close()
        resolve()
      }
    }
  })
}

async function createVersion5Database(fixture: {
  day?: PrayerDataset['days'][number]
  meta?: {
    schemaVersion: number
    source: PrayerDataset['source']
    locations: PrayerDataset['locations']
  }
  settings?: ReadonlyArray<{ key: string; value: unknown }>
}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('salah', 5)
    request.onerror = () => reject(request.error ?? new Error('Не удалось открыть IndexedDB'))
    request.onupgradeneeded = () => {
      const database = request.result
      database.createObjectStore('days', { keyPath: 'key' })
      database.createObjectStore('meta')
      database.createObjectStore('settings', { keyPath: 'key' })
    }
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction(
        ['days', 'meta', 'settings'],
        'readwrite',
      )

      if (fixture.day) {
        transaction.objectStore('days').put({
          ...fixture.day,
          key: `${fixture.day.locationId}:${fixture.day.date}`,
        })
      }
      if (fixture.meta) {
        transaction.objectStore('meta').put(fixture.meta, 'current')
      }
      for (const setting of fixture.settings ?? []) {
        transaction.objectStore('settings').put(setting)
      }

      transaction.onerror = () => reject(
        transaction.error ?? new Error('Не удалось записать IndexedDB'),
      )
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
    request.onerror = () => reject(request.error ?? new Error('Не удалось открыть IndexedDB'))
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

const identity: DatasetIdentity = {
  version: '2-560476895b659c27',
  url: 'prayer-times-current.json',
  sha256: '560476895b659c27b1e75bfac7269dce3c548efdc283882eb5566bf9d153af9e',
}

afterEach(async () => {
  vi.unstubAllGlobals()
  await deleteSalahDatabase()
})

describe('database', () => {
  it('атомарно сохраняет набор данных и читает день по городу и дате', async () => {
    unwrap(await replaceDataset(dataset, identity))

    expect(unwrap(await getPrayerDay('kazan', '2026-09-01'))).toEqual(
      dataset.days[0],
    )
    expect(unwrap(await getDatasetMeta())).toEqual({
      schemaVersion: dataset.schemaVersion,
      source: dataset.source,
      locations: dataset.locations,
      identity,
    })
  })

  it('открывает настоящую v5 как v6 без потери расписания, meta и настроек', async () => {
    const choice: LocationChoice = {
      mode: 'official',
      locationId: 'kazan',
      source: 'manual',
    }
    const calculationSettings = {
      profile: 'dumRt' as const,
      asrMethod: 'hanafi' as const,
      highLatitudeRule: 'dumRt' as const,
    }
    const legacyMeta = {
      schemaVersion: dataset.schemaVersion,
      source: dataset.source,
      locations: dataset.locations,
    }
    const day = dataset.days[0]
    if (!day) throw new Error('Не найден тестовый день')
    await createVersion5Database({
      day,
      meta: legacyMeta,
      settings: [
        { key: 'locationChoice', value: choice },
        { key: 'calculationSettings', value: calculationSettings },
      ],
    })

    expect(unwrap(await getPrayerDay('kazan', '2026-09-01'))).toEqual(
      dataset.days[0],
    )
    expect(unwrap(await getDatasetMeta())).toEqual(legacyMeta)
    expect(unwrap(await getLocationChoice())).toEqual(choice)
    expect(unwrap(await getSetting('calculationSettings'))).toEqual(
      calculationSettings,
    )
    expect(await getDatabaseVersion()).toBe(6)
  })

  it('читает legacy meta без идентичности артефакта для офлайн-fallback', async () => {
    const legacyMeta = {
      schemaVersion: dataset.schemaVersion,
      source: dataset.source,
      locations: dataset.locations,
    }
    await createVersion5Database({ meta: legacyMeta })

    expect(unwrap(await getDatasetMeta())).toEqual(legacyMeta)
  })

  it('при сбое транзакции не показывает частично заменённые meta и дни', async () => {
    unwrap(await replaceDataset(dataset, identity))
    const partialDay = {
      ...dataset.days[0],
      locationId: 'aksubaevo',
      date: '2026-09-02',
    }
    const uncloneableDay = {
      ...dataset.days[0],
      locationId: 'bugulma',
      date: '2026-09-03',
      uncloneable: () => undefined,
    }
    const failedDataset = {
      ...dataset,
      source: { ...dataset.source, updatedAt: '2026-01-02T00:00:00.000Z' },
      days: [partialDay, uncloneableDay],
    } as PrayerDataset
    const failedIdentity: DatasetIdentity = {
      ...identity,
      version: '2-aaaaaaaaaaaaaaaa',
      sha256: 'a'.repeat(64),
    }

    expect(await replaceDataset(failedDataset, failedIdentity)).toEqual({
      ok: false,
      error: { kind: 'storage', reason: 'unavailable' },
    })
    expect(unwrap(await getDatasetMeta())).toEqual({
      schemaVersion: dataset.schemaVersion,
      source: dataset.source,
      locations: dataset.locations,
      identity,
    })
    expect(unwrap(await getPrayerDay('kazan', '2026-09-01'))).toEqual(
      dataset.days[0],
    )
    expect(unwrap(await getPrayerDay('aksubaevo', '2026-09-02'))).toBeUndefined()
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
    expect(await getDatabaseVersion()).toBe(6)
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
    expect(await getDatabaseVersion()).toBe(6)
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
