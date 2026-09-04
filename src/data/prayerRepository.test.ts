import { afterEach, describe, expect, it, vi } from 'vitest'

import { getDeviceTimeZone } from '../domain/locationTime'
import type { Result } from '../domain/result'
import type { PrayerDataset, SavedCoordinates } from '../domain/types'
import {
  deleteSalahDatabase,
  getLocationChoice,
  replaceDataset,
  saveLocationChoice,
  type DatasetMeta,
  type LocationChoice,
} from '../storage/database'
import {
  initializePrayerRepository,
  prayerRepository,
  shouldReplaceDataset,
} from './prayerRepository'

function unwrap<Value>(result: Result<Value, unknown>): Value {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('Ожидался успешный результат')
  return result.value
}

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
})

describe('initializePrayerRepository', () => {
  it('возвращает default-выбор при отсутствии сохранённого выбора', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => dataset }),
    )

    const state = unwrap(await initializePrayerRepository())

    expect(state.locationChoice).toEqual({
      mode: 'official',
      locationId: 'kazan',
      source: 'default',
    })
    expect(state.warning).toBeNull()
  })

  it('сохраняет миграцию старых координат без таймзоны', async () => {
    const legacyCoordinates = {
      latitude: 55.7558,
      longitude: 37.6173,
      accuracy: 18,
      timestamp: 1_788_265_600_000,
      name: 'Москва, Россия',
      source: 'gps',
    }
    unwrap(await saveLocationChoice({
      mode: 'calculated',
      coordinates: legacyCoordinates,
      source: 'automatic',
    } as unknown as LocationChoice))
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => dataset }),
    )

    const state = unwrap(await initializePrayerRepository())

    expect(state.locationChoice).toEqual({
      mode: 'calculated',
      coordinates: {
        ...legacyCoordinates,
        timeZone: getDeviceTimeZone(),
      },
      source: 'automatic',
    })
  })

  it('заменяет повреждённый calculated-выбор безопасным default', async () => {
    unwrap(await saveLocationChoice({
      mode: 'calculated',
      coordinates: {
        latitude: 55.7558,
        longitude: 37.6173,
        accuracy: 18,
        timestamp: 1_788_265_600_000,
        source: 'gps',
        timeZone: ['Europe/Moscow'],
      } as unknown as SavedCoordinates,
      source: 'automatic',
    }))
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => dataset }),
    )

    const state = unwrap(await initializePrayerRepository())

    expect(state.locationChoice).toEqual({
      mode: 'official',
      locationId: 'kazan',
      source: 'default',
    })
  })

  it('возвращает data failure, когда нет кеша и загрузка недоступна', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    expect(await initializePrayerRepository()).toEqual({
      ok: false,
      error: { kind: 'data', reason: 'unavailable' },
    })
  })

  it('использует кеш с типизированным update warning при ошибке обновления', async () => {
    unwrap(await replaceDataset(dataset))
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const state = unwrap(await initializePrayerRepository())

    expect(state.meta).toEqual({
      schemaVersion: dataset.schemaVersion,
      source: dataset.source,
      locations: dataset.locations,
    })
    expect(state.warning).toEqual({ kind: 'update', reason: 'failed' })
  })

  it('возвращает storage failure при недоступном IndexedDB', async () => {
    vi.stubGlobal('indexedDB', {
      open: () => {
        throw new Error('IndexedDB disabled')
      },
    })

    expect(await initializePrayerRepository()).toEqual({
      ok: false,
      error: { kind: 'storage', reason: 'unavailable' },
    })
  })
})

describe('prayerRepository location writes', () => {
  it('атомарно сохраняет режим, официальный id и источник выбора', async () => {
    expect(
      await prayerRepository.saveOfficialLocation('kazan', 'manual'),
    ).toEqual({ ok: true, value: undefined })
    expect(unwrap(await getLocationChoice())).toEqual({
      mode: 'official',
      locationId: 'kazan',
      source: 'manual',
    })
  })

  it('атомарно сохраняет режим, координаты и источник выбора', async () => {
    const coordinates: SavedCoordinates = {
      latitude: 55.7558,
      longitude: 37.6173,
      accuracy: 18,
      timestamp: 1_788_265_600_000,
      source: 'gps',
      timeZone: 'Europe/Moscow',
    }

    expect(
      await prayerRepository.saveCalculatedLocation(coordinates, 'automatic'),
    ).toEqual({ ok: true, value: undefined })
    expect(unwrap(await getLocationChoice())).toEqual({
      mode: 'calculated',
      coordinates,
      source: 'automatic',
    })
  })

  it('возвращает storage failure вместо исключения при ошибке записи', async () => {
    vi.stubGlobal('indexedDB', {
      open: () => {
        throw new Error('IndexedDB disabled')
      },
    })

    expect(
      await prayerRepository.saveOfficialLocation('kazan', 'manual'),
    ).toEqual({
      ok: false,
      error: { kind: 'storage', reason: 'unavailable' },
    })
  })
})
