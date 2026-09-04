import { afterEach, describe, expect, it, vi } from 'vitest'

import { getDeviceTimeZone } from '../domain/locationTime'
import type { PrayerDataset, SavedCoordinates } from '../domain/types'
import {
  deleteSalahDatabase,
  setSetting,
  type DatasetMeta,
} from '../storage/database'
import {
  initializePrayerRepository,
  shouldReplaceDataset,
} from './prayerRepository'

const dataset = {
  schemaVersion: 2,
  source: {
    name: 'ДУМ Республики Татарстан',
    url: 'https://dumrt.ru/ru/help-info/prayertime/',
    updatedAt: '2025-12-27T10:49:10.000Z',
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
} satisfies PrayerDataset

afterEach(async () => {
  vi.unstubAllGlobals()
  await deleteSalahDatabase()
})

describe('shouldReplaceDataset', () => {
  it('заменяет сохранённые метаданные старой версии без поля years', () => {
    const legacyMeta = {
      schemaVersion: 1,
      source: { ...dataset.source, years: undefined, year: 2026 },
      locations: [],
    } as unknown as DatasetMeta

    expect(shouldReplaceDataset(legacyMeta, dataset)).toBe(true)
  })

  it('не перезаписывает идентичный актуальный набор', () => {
    const currentMeta: DatasetMeta = {
      schemaVersion: dataset.schemaVersion,
      source: dataset.source,
      locations: [],
    }

    expect(shouldReplaceDataset(currentMeta, dataset)).toBe(false)
  })

  it('явно дополняет старые сохранённые координаты таймзоной устройства', async () => {
    const legacyCoordinates = {
      latitude: 55.7558,
      longitude: 37.6173,
      accuracy: 18,
      timestamp: 1_788_265_600_000,
      name: 'Москва, Россия',
      source: 'gps',
    }
    await setSetting(
      'calculatedLocation',
      legacyCoordinates as unknown as SavedCoordinates,
    )
    await setSetting('locationMode', 'calculated')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => dataset }),
    )

    const repository = await initializePrayerRepository()

    expect(repository.locationMode).toBe('calculated')
    expect(repository.calculatedLocation).toEqual({
      ...legacyCoordinates,
      timeZone: getDeviceTimeZone(),
    })
  })

  it.each([
    ['массив', ['Europe/Moscow']],
    ['объект String', Object('Europe/Moscow')],
  ])('отклоняет сохранённую таймзону в виде %s', async (_kind, timeZone) => {
    await setSetting(
      'calculatedLocation',
      {
        latitude: 55.7558,
        longitude: 37.6173,
        accuracy: 18,
        timestamp: 1_788_265_600_000,
        source: 'gps',
        timeZone,
      } as unknown as SavedCoordinates,
    )
    await setSetting('locationMode', 'calculated')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => dataset }),
    )

    const repository = await initializePrayerRepository()

    expect(repository.locationMode).toBe('official')
    expect(repository.calculatedLocation).toBeNull()
  })
})
