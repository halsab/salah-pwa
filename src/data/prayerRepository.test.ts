import { afterEach, describe, expect, it, vi } from 'vitest'

import { getDeviceTimeZone } from '../domain/locationTime'
import type { Result } from '../domain/result'
import type {
  PrayerDataset,
  PrayerDatasetManifest,
  SavedCoordinates,
} from '../domain/types'
import {
  deleteSalahDatabase,
  getDatasetMeta,
  getLocationChoice,
  getPrayerDay,
  replaceDataset,
  saveLocationChoice,
  type DatasetIdentity,
  type LocationChoice,
} from '../storage/database'
import {
  initializePrayerRepository,
  prayerRepository,
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

const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const MANIFEST_URL = `${import.meta.env.BASE_URL}data/prayer-times-manifest.json`
const DATASET_URL = `${import.meta.env.BASE_URL}data/prayer-times-current.json`

function manifestWithHash(sha256 = HASH_A): PrayerDatasetManifest {
  return {
    schemaVersion: 1,
    version: `2-${sha256.slice(0, 16)}`,
    url: 'prayer-times-current.json',
    sha256,
  }
}

function responseWithJson(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
  })
}

function stubSuccessfulUpdate(
  sha256 = HASH_A,
  value: unknown = dataset,
): ReturnType<typeof vi.fn> {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(responseWithJson(manifestWithHash(sha256)))
    .mockResolvedValueOnce(responseWithJson(value))
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}

function initializeWithDigest(sha256 = HASH_A) {
  return initializePrayerRepository({ digest: () => Promise.resolve(sha256) })
}

async function createLegacyVersion5PrayerCache(): Promise<void> {
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
      const transaction = database.transaction(['days', 'meta'], 'readwrite')
      const day = dataset.days[0]
      if (!day) throw new Error('Не найден тестовый день')
      transaction.objectStore('days').put({
        ...day,
        key: `${day.locationId}:${day.date}`,
      })
      transaction.objectStore('meta').put({
        schemaVersion: dataset.schemaVersion,
        source: dataset.source,
        locations: dataset.locations,
      }, 'current')
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

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await deleteSalahDatabase()
})

describe('initializePrayerRepository', () => {
  it('возвращает default-выбор при отсутствии сохранённого выбора', async () => {
    const fetcher = stubSuccessfulUpdate()

    const state = unwrap(await initializeWithDigest())

    expect(state.locationChoice).toEqual({
      mode: 'official',
      locationId: 'kazan',
      source: 'default',
    })
    expect(state.warning).toBeNull()
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      MANIFEST_URL,
      { cache: 'no-store' },
    )
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      DATASET_URL,
      { cache: 'no-store' },
    )
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
    stubSuccessfulUpdate()

    const state = unwrap(await initializeWithDigest())

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
    stubSuccessfulUpdate()

    const state = unwrap(await initializeWithDigest())

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

  it('использует legacy-кеш без identity при офлайн-ошибке manifest', async () => {
    await createLegacyVersion5PrayerCache()
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetcher)
    vi.stubGlobal('navigator', { onLine: false })

    const state = unwrap(await initializePrayerRepository())

    expect(state.meta).toEqual({
      schemaVersion: dataset.schemaVersion,
      source: dataset.source,
      locations: dataset.locations,
    })
    expect(state.warning).toEqual({ kind: 'update', reason: 'failed' })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(unwrap(await getPrayerDay('kazan', '2026-09-01'))).toEqual(
      dataset.days[0],
    )
  })

  it('по совпавшему SHA возвращает кеш без dataset fetch, digest, decode, parse и write', async () => {
    const cachedDataset = {
      ...dataset,
      source: {
        ...dataset.source,
        updatedAt: '2024-01-01T00:00:00.000Z',
        years: [2024],
      },
    }
    const cachedIdentity = {
      version: '1-legacy-version',
      url: 'legacy-prayer-data.json',
      sha256: HASH_A,
    } as unknown as DatasetIdentity
    unwrap(await replaceDataset(cachedDataset, cachedIdentity))
    const fetcher = vi.fn().mockResolvedValue(responseWithJson(manifestWithHash()))
    vi.stubGlobal('fetch', fetcher)
    const digest = vi.fn(() => Promise.resolve(HASH_A))
    const decode = vi.fn((_bytes: Uint8Array) => '')
    const parse = vi.fn((_text: string) => dataset)

    const state = unwrap(await initializePrayerRepository({
      digest,
      decode,
      parse,
    }))

    expect(state.meta).toEqual({
      schemaVersion: cachedDataset.schemaVersion,
      source: cachedDataset.source,
      locations: cachedDataset.locations,
      identity: cachedIdentity,
    })
    expect(state.warning).toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(digest).not.toHaveBeenCalled()
    expect(decode).not.toHaveBeenCalled()
    expect(parse).not.toHaveBeenCalled()
  })

  it('заменяет кеш при другом SHA даже с тем же updatedAt и затем стартует офлайн', async () => {
    const oldIdentity = {
      version: `2-${HASH_A.slice(0, 16)}`,
      url: 'prayer-times-current.json',
      sha256: HASH_A,
    } satisfies DatasetIdentity
    unwrap(await replaceDataset(dataset, oldIdentity))
    const fetcher = stubSuccessfulUpdate(HASH_B)

    const updatedState = unwrap(await initializeWithDigest(HASH_B))

    expect(updatedState.meta).toEqual({
      schemaVersion: dataset.schemaVersion,
      source: dataset.source,
      locations: dataset.locations,
      identity: {
        version: `2-${HASH_B.slice(0, 16)}`,
        url: 'prayer-times-current.json',
        sha256: HASH_B,
      },
    })
    expect(fetcher).toHaveBeenCalledTimes(2)

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    vi.stubGlobal('navigator', { onLine: false })
    const offlineState = unwrap(await initializePrayerRepository())

    expect(offlineState.meta.identity?.sha256).toBe(HASH_B)
    expect(offlineState.warning).toEqual({ kind: 'update', reason: 'failed' })
    expect(unwrap(await getPrayerDay('kazan', '2026-09-01'))).toEqual(
      dataset.days[0],
    )
  })

  it('при несовпавшем digest не вызывает parser и сохраняет последний хороший кеш', async () => {
    const oldIdentity = {
      version: `2-${HASH_A.slice(0, 16)}`,
      url: 'prayer-times-current.json',
      sha256: HASH_A,
    } satisfies DatasetIdentity
    unwrap(await replaceDataset(dataset, oldIdentity))
    const fetcher = stubSuccessfulUpdate(HASH_B, { broken: true })
    const decode = vi.fn((_bytes: Uint8Array) => '{"broken":true}')
    const parse = vi.fn((_text: string) => ({ broken: true }))

    const state = unwrap(await initializePrayerRepository({
      digest: () => Promise.resolve('c'.repeat(64)),
      decode,
      parse,
    }))

    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(decode).not.toHaveBeenCalled()
    expect(parse).not.toHaveBeenCalled()
    expect(state.meta.identity).toEqual(oldIdentity)
    expect(state.warning).toEqual({ kind: 'update', reason: 'failed' })
    expect(unwrap(await getPrayerDay('kazan', '2026-09-01'))).toEqual(
      dataset.days[0],
    )
  })

  it('не пишет проверенные по hash, но некорректные JSON-данные', async () => {
    const oldIdentity = {
      version: `2-${HASH_A.slice(0, 16)}`,
      url: 'prayer-times-current.json',
      sha256: HASH_A,
    } satisfies DatasetIdentity
    unwrap(await replaceDataset(dataset, oldIdentity))
    const fetcher = vi.fn()
      .mockResolvedValueOnce(responseWithJson(manifestWithHash(HASH_B)))
      .mockResolvedValueOnce(new Response('{broken'))
    vi.stubGlobal('fetch', fetcher)

    const state = unwrap(await initializeWithDigest(HASH_B))

    expect(state.meta.identity).toEqual(oldIdentity)
    expect(state.warning).toEqual({ kind: 'update', reason: 'failed' })
    expect(unwrap(await getDatasetMeta())).toEqual(state.meta)
  })

  it('сохраняет кеш при невалидном manifest, а без кеша возвращает data failure', async () => {
    const oldIdentity = {
      version: `2-${HASH_A.slice(0, 16)}`,
      url: 'prayer-times-current.json',
      sha256: HASH_A,
    } satisfies DatasetIdentity
    unwrap(await replaceDataset(dataset, oldIdentity))
    const fetcher = vi.fn().mockResolvedValue(responseWithJson({
      ...manifestWithHash(),
      url: 'unexpected.json',
    }))
    vi.stubGlobal('fetch', fetcher)

    const cachedState = unwrap(await initializePrayerRepository())

    expect(cachedState.meta.identity).toEqual(oldIdentity)
    expect(cachedState.warning).toEqual({ kind: 'update', reason: 'failed' })
    expect(fetcher).toHaveBeenCalledTimes(1)

    await deleteSalahDatabase()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(responseWithJson({
      ...manifestWithHash(),
      sha256: 'INVALID',
    })))
    expect(await initializePrayerRepository()).toEqual({
      ok: false,
      error: { kind: 'data', reason: 'invalid' },
    })
  })

  it('без кеша возвращает data failure для несовпавшего hash и невалидных данных', async () => {
    stubSuccessfulUpdate(HASH_A)
    expect(await initializeWithDigest(HASH_B)).toEqual({
      ok: false,
      error: { kind: 'data', reason: 'invalid' },
    })
    expect(unwrap(await getDatasetMeta())).toBeUndefined()

    stubSuccessfulUpdate(HASH_A, { broken: true })
    expect(await initializeWithDigest(HASH_A)).toEqual({
      ok: false,
      error: { kind: 'data', reason: 'invalid' },
    })
    expect(unwrap(await getDatasetMeta())).toBeUndefined()
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
