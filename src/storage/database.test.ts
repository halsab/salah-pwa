import { afterEach, describe, expect, it } from 'vitest'

import type { PrayerDataset } from '../domain/types'
import {
  deleteSalahDatabase,
  getDatasetMeta,
  getPrayerDay,
  getSetting,
  replaceDataset,
  setSetting,
} from './database'

async function createLegacyVersion3Database(
  settings: ReadonlyArray<{ key: string; value: unknown }>,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('salah', 3)
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
  await deleteSalahDatabase()
})

describe('database', () => {
  it('атомарно сохраняет набор данных и читает день по городу и дате', async () => {
    await replaceDataset(dataset)

    expect(await getPrayerDay('kazan', '2026-09-01')).toEqual(dataset.days[0])
    expect(await getDatasetMeta()).toEqual({
      schemaVersion: dataset.schemaVersion,
      source: dataset.source,
      locations: dataset.locations,
    })
  })

  it('хранит пользовательский населённый пункт отдельно от расписания', async () => {
    await setSetting('locationId', 'kazan')

    expect(await getSetting('locationId')).toBe('kazan')
  })

  it('хранит режим, GPS-координаты и независимые настройки расчёта', async () => {
    const coordinates = {
      latitude: 55.7558,
      longitude: 37.6173,
      accuracy: 18,
      timestamp: 1_788_265_600_000,
      name: 'Москва, Россия',
      cityId: 524901,
      nameSource: 'geonames',
      source: 'gps',
      timeZone: 'Europe/Moscow',
    } as const
    const calculationSettings = {
      profile: 'turkey',
      asrMethod: 'standard',
      highLatitudeRule: 'seventhOfNight',
    } as const

    await setSetting('locationMode', 'calculated')
    await setSetting('calculatedLocation', coordinates)
    await setSetting('calculationSettings', calculationSettings)

    expect(await getSetting('locationMode')).toBe('calculated')
    expect(await getSetting('calculatedLocation')).toEqual(coordinates)
    expect(await getSetting('calculationSettings')).toEqual(calculationSettings)
  })

  it('последовательно обновляет базу v3 до v4 без потери выбора', async () => {
    const legacyCoordinates = {
      latitude: 55.7558,
      longitude: 37.6173,
      accuracy: 18,
      timestamp: 1_788_265_600_000,
      name: 'Москва, Россия',
      source: 'gps',
    }
    await createLegacyVersion3Database([
      { key: 'calculatedLocation', value: legacyCoordinates },
      { key: 'locationId', value: 'kazan' },
      { key: 'locationMode', value: 'calculated' },
    ])

    expect(await getSetting('calculatedLocation')).toEqual(legacyCoordinates)
    expect(await getSetting('locationId')).toBe('kazan')
    expect(await getSetting('locationMode')).toBe('calculated')
    expect(await getDatabaseVersion()).toBe(4)
  })
})
