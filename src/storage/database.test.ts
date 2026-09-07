import { afterEach, describe, expect, it, vi } from 'vitest'

import { getDatasetRevision } from '../domain/scheduleContext'
import type { Result } from '../domain/result'
import type { PrayerDataset } from '../domain/types'
import {
  deleteSalahDatabase,
  getDatasetMeta,
  getLocationChoice,
  getPrayerDay,
  getPrayerDays,
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
}, version = 5): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('salah', version)
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

  it('открывает настоящую v5 как v8 без потери расписания, meta и настроек', async () => {
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
    expect(unwrap(await getLocationChoice())).toMatchObject(choice)
    expect(unwrap(await getSetting('calculationSettings'))).toEqual(
      calculationSettings,
    )
    expect(await getDatabaseVersion()).toBe(8)
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

    expect(unwrap(await getLocationChoice())).toMatchObject(choice)
  })

  it('мигрирует GPS-выбор v4 в автоматический calculated-выбор v8', async () => {
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

    expect(unwrap(await getLocationChoice())).toMatchObject({
      mode: 'calculated',
      coordinates: legacyCoordinates,
      source: 'automatic',
    })
    expect(await getDatabaseVersion()).toBe(8)
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

    expect(unwrap(await getLocationChoice())).toMatchObject({
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

    expect(unwrap(await getLocationChoice())).toMatchObject({
      mode: 'official',
      locationId: 'naberezhnye-chelny',
      source: 'manual',
    })
  })

  it('не создаёт сохранённый выбор, если legacy-выбора не было', async () => {
    await createLegacyVersion4Database([])

    expect(unwrap(await getLocationChoice())).toBeUndefined()
    expect(await getDatabaseVersion()).toBe(8)
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

describe('согласованное окно расписаний', () => {
  it('читает все дни одной транзакцией с ожидаемой версией, сохраняя отсутствующие даты', async () => {
    unwrap(await replaceDataset(dataset, identity))
    const revision = getDatasetRevision({ ...dataset, identity })
    expect(unwrap(await getPrayerDays('kazan', ['2026-08-31', '2026-09-01', '2026-09-02'], revision)))
      .toEqual([undefined, dataset.days[0], undefined])
  })

  it('при замене набора не выдаёт данные новой версии под старым контекстом', async () => {
    unwrap(await replaceDataset(dataset, identity))
    const revision = getDatasetRevision({ ...dataset, identity })
    const updated = { ...dataset, days: dataset.days.map((day) => ({ ...day, asr: '16:25' as const })) }
    unwrap(await replaceDataset(updated, { ...identity, version: 'v2', sha256: 'hash2' }))
    expect(await getPrayerDays('kazan', ['2026-09-01'], revision)).toEqual({ ok: false, error: { kind: 'data', reason: 'invalid' } })
  })
})

it('migrates real v6 Nominatim names without requesting the network or deleting the place', async () => {
  const legacy = { latitude: 55.8, longitude: 49.1, accuracy: 20, timestamp: 123,
    timeZone: 'Europe/Moscow', name: 'Сохранённое название', nameSource: 'nominatim', source: 'gps' }
  await createVersion5Database({ settings: [{ key: 'locationChoice', value: { mode: 'calculated', source: 'automatic', coordinates: legacy } }] }, 6)
  const choice = unwrap(await getLocationChoice())
  expect(choice?.place).toMatchObject({ name: legacy.name, latitude: legacy.latitude, longitude: legacy.longitude,
    selection: 'gps', automaticTimeZone: { id: 'Europe/Moscow', source: 'legacy' } })
  expect(choice?.place).not.toHaveProperty('nameSource')
  expect(await getDatabaseVersion()).toBe(8)
})

it('checks operation epoch after opening IndexedDB so obsolete saves do not start', async () => {
  unwrap(await saveLocationChoice({ mode: 'official', locationId: 'kazan', source: 'manual' }, () => false))
  expect(unwrap(await getLocationChoice())).toBeUndefined()
})

it('recovers after a browser rejects opening a newer incompatible database', async () => {
  await createVersion5Database({}, 9)
  expect(await getLocationChoice()).toMatchObject({ ok: false, error: { kind: 'storage' } })
  await deleteSalahDatabase()
  expect(unwrap(await getLocationChoice())).toBeUndefined()
})

it.each(['official', 'calculated'] as const)('migrates real v7 %s preferences, retaining original custom settings', async mode => {
  const legacy = { profile: 'dumRf', asrMethod: 'standard', highLatitudeRule: 'nearestDay' }
  const choice = mode === 'official' ? { mode, locationId: 'kazan', source: 'manual' }
    : { mode, source: 'manual', coordinates: { latitude: 55, longitude: 37, accuracy: null, timestamp: 0, timeZone: 'Europe/Moscow' } }
  await createVersion5Database({ settings: [{ key: 'calculationSettings', value: legacy }, { key: 'locationChoice', value: choice }] }, 7)
  expect(unwrap(await getSetting('sourcePreferences'))).toMatchObject({ mode: 'manual', source: { kind: mode }, calculationDraft: { profile: 'dumRf', overrides: { asrMethod: 'standard', highLatitudeRule: 'nearestDay' } } })
  expect(unwrap(await getSetting('calculationSettings'))).toEqual(legacy)
  expect(unwrap(await getLocationChoice())).toEqual(choice)
  expect(await getDatabaseVersion()).toBe(8)
})
it('migrates a manual legacy city without expert settings to automatic source', async () => {
  await createVersion5Database({ settings: [{ key: 'locationChoice', value: { mode: 'official', locationId: 'kazan', source: 'manual' } }] }, 7)
  expect(unwrap(await getSetting('sourcePreferences'))).toEqual({ mode: 'automatic' })
  expect(unwrap(await getLocationChoice())).toMatchObject({ source: 'manual', locationId: 'kazan' })
})
