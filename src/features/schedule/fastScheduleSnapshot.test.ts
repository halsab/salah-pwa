import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDatasetRevision, scheduleContextKey, type ScheduleContext } from '../../domain/scheduleContext'
import { automaticPreferences } from '../../domain/sourcePreferences'
import type { PrayerDay } from '../../domain/types'
import type { DatasetMeta } from '../../storage/database'
import { createGpsPlace, createOfficialPlace, isFreshGpsPlace, withNearbyCity } from '../../domain/place'
import { DEFAULT_CALCULATION_SETTINGS, calculatePrayerSchedule } from '../../domain/prayerCalculation'
import { automaticCalculationRecommendation } from '../../domain/calculationSettings'
import type { City } from '../../domain/cities'
import {
  activateFastScheduleContext,
  currentFastScheduleGeneration,
  FAST_SCHEDULE_STORAGE_KEYS,
  invalidateFastScheduleSnapshot,
  readFastScheduleSnapshot,
  writeFastScheduleSnapshot,
} from './fastScheduleSnapshot'

const now = new Date('2026-10-19T10:00:00.000Z')
const meta: DatasetMeta = {
  provider: 'dumRt',
  schemaVersion: 3,
  source: { name: 'ДУМ Республики Татарстан', url: 'https://dumrt.ru/ru/help-info/prayertime/', updatedAt: '2026-10-01T00:00:00.000Z', years: [2026] },
  locations: [{ id: 'kazan', name: 'Казань', latitude: 55.7946, longitude: 49.1115 }],
  providerInfo: { id: 'dumRt', revision: 'r1', timeZone: 'Europe/Moscow', coverage: { geographic: 'RU-TA', startDate: '2026-01-01', endDate: '2026-12-31' } },
  identity: { version: 'v1', url: 'prayer-times-current.json', sha256: 'a'.repeat(64), sequence: 1 },
}
const location = meta.locations.find(item => item.id === 'kazan')
if (!location) throw new Error('Kazan fixture location is missing')
const place = createOfficialPlace(location, now.getTime())
const context: ScheduleContext = {
  location: { id: place.id, latitude: place.latitude, longitude: place.longitude },
  date: '2026-10-19', timeZone: 'Europe/Moscow', mode: 'automatic', source: 'official',
  provider: 'dumRt', datasetRevision: getDatasetRevision(meta), datasetVersion: 'v1', coverage: 'RU-TA', localityId: 'kazan',
}
const schedule: PrayerDay = {
  locationId: 'kazan', date: context.date, timeZone: context.timeZone,
  coordinates: { latitude: place.latitude, longitude: place.longitude },
  fajrStart: '04:18', fajrJamaat: '04:52', sunrise: '06:23', zenith: '11:29', dhuhr: '12:00',
  asr: '14:39', maghrib: '16:35', isha: '18:16', provenance: { fajrJamaat: 'published', zenith: 'published' },
}

function memoryStorage(): Storage {
  const entries = new Map<string, string>()
  return {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => { entries.set(key, value) },
    removeItem: key => { entries.delete(key) },
    clear: () => entries.clear(),
    key: index => [...entries.keys()][index] ?? null,
    get length() { return entries.size },
  }
}

let store: Storage

function seed(overrides: Partial<Parameters<typeof writeFastScheduleSnapshot>[0]> = {}) {
  const input = {
    appVersion: 'test-build', now, deviceTimeZone: 'Europe/Moscow', context, schedule, place,
    selectionSource: 'default' as const, preferences: automaticPreferences(), meta,
    ...overrides,
  }
  const generation = invalidateFastScheduleSnapshot()
  if (!generation || !activateFastScheduleContext(scheduleContextKey(input.context), generation)) return false
  return writeFastScheduleSnapshot({ ...input, generation })
}

describe('fast prayer schedule snapshot', () => {
  beforeEach(() => {
    store = memoryStorage()
    vi.stubGlobal('localStorage', store)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('writes a bounded checksum-protected cache and restores the exact current official day', () => {
    expect(seed({ place: { ...place, timestamp: now.getTime(), cityId: 42,
      nearbyCity: { id: 42, name: 'Казань', distanceKm: 1 } } })).toBe(true)
    const raw = store.getItem(FAST_SCHEDULE_STORAGE_KEYS.snapshot)
    expect(raw).not.toBeNull()
    expect(new TextEncoder().encode(raw ?? '').length).toBeLessThanOrEqual(4_096)
    const restored = readFastScheduleSnapshot({ appVersion: 'test-build', now, deviceTimeZone: 'Europe/Moscow' })
    expect(restored).toMatchObject({
      context, schedule, place: { id: place.id, latitude: place.latitude, longitude: place.longitude },
      preferences: automaticPreferences(), meta: { locations: [{ id: 'kazan' }] },
    })
    expect(restored?.place.timestamp).toBe(now.getTime())
    expect(restored?.place.accuracy).toBeNull()
    expect(restored?.place.nearbyCity).toBeUndefined()
    expect(restored?.place.cityId).toBeUndefined()
  })

  it('сохраняет свежесть GPS и проверенную страну, нужную для автоматического профиля', () => {
    const city: City = { id: 745044, name: 'Стамбул', countryCode: 'TR', admin1Code: '34', admin1Name: 'Стамбул',
      latitude: 41.0138, longitude: 28.9497, population: 1, timeZone: 'Europe/Istanbul' }
    const gps = withNearbyCity(createGpsPlace({ ...city, accuracy: 300, timestamp: now.getTime() - 5 * 60_000 },
      'Europe/Istanbul', null, 'gps:istanbul'), city)
    const settings = { profile: 'turkey', asrMethod: 'standard', highLatitudeRule: 'twilightAngle' } as const
    const calculatedContext: ScheduleContext = {
      location: { id: gps.id, latitude: gps.latitude, longitude: gps.longitude }, date: context.date,
      timeZone: 'Europe/Istanbul', mode: 'automatic', source: 'calculated', settings,
    }
    const calculatedSchedule = calculatePrayerSchedule(calculatedContext.location, context.date, calculatedContext.timeZone, settings)
    expect(seed({ context: calculatedContext, schedule: calculatedSchedule, place: gps, meta: null,
      deviceTimeZone: 'Europe/Istanbul' })).toBe(true)

    const restored = readFastScheduleSnapshot({ appVersion: 'test-build', now, deviceTimeZone: 'Europe/Istanbul' })
    expect(restored?.place.nearbyCity).toMatchObject({ countryCode: 'TR', latitude: city.latitude, longitude: city.longitude })
    expect(automaticCalculationRecommendation(restored?.place).profile).toBe('turkey')
    expect(restored?.place.timestamp).toBe(gps.timestamp)
    expect(isFreshGpsPlace(restored?.place ?? null, now.getTime())).toBe(true)
  })

  it('валидирует DUM RT по Europe/Moscow, сохраняя timezone GPS-места устройства', () => {
    const gpsPlace = { ...place, id: 'gps:kazan', selection: 'gps' as const, timeZone: 'Asia/Tokyo',
      automaticTimeZone: { id: 'Asia/Tokyo', source: 'device' as const }, timestamp: now.getTime(), accuracy: 250 }
    const officialGpsContext: ScheduleContext = { ...context,
      location: { id: gpsPlace.id, latitude: gpsPlace.latitude, longitude: gpsPlace.longitude },
    }
    const officialGpsSchedule = { ...schedule, coordinates: { latitude: gpsPlace.latitude, longitude: gpsPlace.longitude } }
    expect(seed({ context: officialGpsContext, schedule: officialGpsSchedule, place: gpsPlace,
      deviceTimeZone: 'Asia/Tokyo' })).toBe(true)
    expect(readFastScheduleSnapshot({ appVersion: 'test-build', now, deviceTimeZone: 'Asia/Tokyo' }))
      .toMatchObject({ context: { timeZone: 'Europe/Moscow' }, place: { timeZone: 'Asia/Tokyo' } })
  })

  it.each([
    ['другая версия приложения', { appVersion: 'new-build' }],
    ['следующий день в зоне источника', { now: new Date('2026-10-20T00:30:00.000Z') }],
  ])('отбрасывает кеш при смене %s', (_, input) => {
    expect(seed()).toBe(true)
    expect(readFastScheduleSnapshot({ appVersion: 'test-build', now, deviceTimeZone: 'Europe/Moscow', ...input })).toBeNull()
  })

  it('удаляет запись с повреждённой контрольной суммой', () => {
    expect(seed()).toBe(true)
    const raw = store.getItem(FAST_SCHEDULE_STORAGE_KEYS.snapshot) ?? ''
    store.setItem(FAST_SCHEDULE_STORAGE_KEYS.snapshot, raw.replace('04:18', '04:19'))
    expect(readFastScheduleSnapshot({ appVersion: 'test-build', now, deviceTimeZone: 'Europe/Moscow' })).toBeNull()
    expect(store.getItem(FAST_SCHEDULE_STORAGE_KEYS.snapshot)).toBeNull()
  })

  it('не принимает снимок после смены активного контекста или удаления данных', () => {
    expect(seed()).toBe(true)
    const staleGeneration = currentFastScheduleGeneration()
    store.setItem(FAST_SCHEDULE_STORAGE_KEYS.activeContext,
      JSON.stringify({ generation: staleGeneration, contextKey: JSON.stringify(['other', context.date]) }))
    expect(readFastScheduleSnapshot({ appVersion: 'test-build', now, deviceTimeZone: 'Europe/Moscow' })).toBeNull()
    expect(store.getItem(FAST_SCHEDULE_STORAGE_KEYS.snapshot)).toBeNull()

    expect(seed()).toBe(true)
    invalidateFastScheduleSnapshot()
    expect(readFastScheduleSnapshot({ appVersion: 'test-build', now, deviceTimeZone: 'Europe/Moscow' })).toBeNull()
  })

  it.each([
    ['места', { ...context, location: { ...context.location, latitude: context.location.latitude + 0.01 } }],
    ['часового пояса', { ...context, timeZone: 'Asia/Tokyo' }],
    ['источника', {
      location: context.location, date: context.date, timeZone: context.timeZone, mode: 'manual',
      source: 'calculated', settings: DEFAULT_CALCULATION_SETTINGS,
    } satisfies ScheduleContext],
    ['revision набора', { ...context, datasetRevision: 'new-revision', datasetVersion: 'v2' }],
  ])('отбрасывает снимок после изменения %s в активном контексте', (_, changedContext) => {
    expect(seed()).toBe(true)
    const generation = currentFastScheduleGeneration()
    store.setItem(FAST_SCHEDULE_STORAGE_KEYS.activeContext,
      JSON.stringify({ generation, contextKey: scheduleContextKey(changedContext) }))

    expect(readFastScheduleSnapshot({ appVersion: 'test-build', now, deviceTimeZone: 'Europe/Moscow' })).toBeNull()
    expect(store.getItem(FAST_SCHEDULE_STORAGE_KEYS.snapshot)).toBeNull()
  })

  it('не позволяет старой асинхронной записи вернуть снимок после смены поколения', () => {
    expect(seed()).toBe(true)
    const staleGeneration = currentFastScheduleGeneration()
    const generation = invalidateFastScheduleSnapshot()
    expect(generation).not.toBe(staleGeneration)
    expect(generation && activateFastScheduleContext(scheduleContextKey(context), generation)).toBe(true)
    expect(writeFastScheduleSnapshot({ appVersion: 'test-build', now, deviceTimeZone: 'Europe/Moscow',
      generation: staleGeneration, context, schedule, place, selectionSource: 'default',
      preferences: automaticPreferences(), meta })).toBe(false)
    expect(store.getItem(FAST_SCHEDULE_STORAGE_KEYS.snapshot)).toBeNull()
  })

  it('refuses an oversized or invalid official day without storing it', () => {
    expect(seed({ place: { ...place, name: 'a'.repeat(5_000) } })).toBe(false)
    expect(store.getItem(FAST_SCHEDULE_STORAGE_KEYS.snapshot)).toBeNull()

    expect(seed({ schedule: { ...schedule, fajrStart: 'bad' } as unknown as typeof schedule })).toBe(false)
    expect(store.getItem(FAST_SCHEDULE_STORAGE_KEYS.snapshot)).toBeNull()
  })

  it('fails closed when browser storage is unavailable', () => {
    vi.stubGlobal('localStorage', { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') }, removeItem() { throw new Error('denied') } })
    expect(readFastScheduleSnapshot({ appVersion: 'test-build', now, deviceTimeZone: 'Europe/Moscow' })).toBeNull()
    expect(seed()).toBe(false)
  })
})


it('restores verified official neighbor context within the existing size cap', () => {
  store = memoryStorage()
  vi.stubGlobal('localStorage', store)
  try {
    const neighbors = [{ ...schedule, date: '2026-10-18' }, { ...schedule, date: '2026-10-20' }]
    expect(seed({ neighbors })).toBe(true)
    const restored = readFastScheduleSnapshot({ appVersion: 'test-build', now, deviceTimeZone: 'Europe/Moscow' })
    expect(restored?.neighbors?.map(row => row.date)).toEqual(['2026-10-18', '2026-10-20'])
    expect(new TextEncoder().encode(store.getItem(FAST_SCHEDULE_STORAGE_KEYS.snapshot) ?? '').length).toBeLessThanOrEqual(4096)
    expect(seed({ neighbors: [requiredNeighbor(neighbors)] })).toBe(true)
    expect(readFastScheduleSnapshot({ appVersion: 'test-build', now, deviceTimeZone: 'Europe/Moscow' })?.neighbors).toHaveLength(1)
    expect(seed({ neighbors: neighbors.map(row => ({ ...row, locationId: 'wrong' })) })).toBe(false)
  } finally { vi.unstubAllGlobals() }
})

function requiredNeighbor(neighbors: PrayerDay[]): PrayerDay {
  const row = neighbors[0]
  if (!row) throw new Error('Missing neighbor fixture')
  return row
}

it('degrades oversized validated neighbor context to a smaller usable snapshot', () => {
  store = memoryStorage()
  vi.stubGlobal('localStorage', store)
  try {
    const neighbors = [{ ...schedule, date: '2026-10-18' }, { ...schedule, date: '2026-10-20' }]
    expect(seed({ neighbors, place: { ...place, name: 'x'.repeat(1200) } })).toBe(true)
    const raw = store.getItem(FAST_SCHEDULE_STORAGE_KEYS.snapshot) ?? ''
    expect(new TextEncoder().encode(raw).length).toBeLessThanOrEqual(4096)
    const restored = readFastScheduleSnapshot({ appVersion: 'test-build', now, deviceTimeZone: 'Europe/Moscow' })
    expect(restored?.schedule).toEqual(schedule)
    expect(restored?.neighbors?.length).toBe(1)
    expect(restored?.neighbors?.every(row => ['2026-10-18', '2026-10-20'].includes(row.date))).toBe(true)
  } finally { vi.unstubAllGlobals() }
})

it('retains the verified selected day when no neighbor row fits the fast-cache limit', () => {
  store = memoryStorage()
  vi.stubGlobal('localStorage', store)
  try {
    const neighbors = [{ ...schedule, date: '2026-10-18' }, { ...schedule, date: '2026-10-20' }]
    expect(seed({ neighbors, place: { ...place, name: 'x'.repeat(1700) } })).toBe(true)
    const restored = readFastScheduleSnapshot({ appVersion: 'test-build', now, deviceTimeZone: 'Europe/Moscow' })
    expect(restored?.schedule).toEqual(schedule)
    expect(restored?.neighbors).toEqual([])
  } finally { vi.unstubAllGlobals() }
})


it('accepts only the declared schema-v3 partial coverage neighbors, including a single-day dataset', () => {
  store = memoryStorage()
  vi.stubGlobal('localStorage', store)
  try {
    const coverage = { geographic: 'RU-TA', startDate: context.date, endDate: context.date }
    if (!meta.providerInfo) throw new Error('Missing provider fixture')
    const single = { ...meta, providerInfo: { ...meta.providerInfo, coverage } }
    const singleContext = { ...context, datasetRevision: getDatasetRevision(single) }
    expect(seed({ meta: single, context: singleContext, neighbors: [] })).toBe(true)
    expect(readFastScheduleSnapshot({ appVersion: 'test-build', now, deviceTimeZone: 'Europe/Moscow' })?.neighbors).toEqual([])
    expect(seed({ meta: single, context: singleContext, neighbors: [{ ...schedule, date: '2026-10-20' }] })).toBe(false)
    const partial = { ...single, providerInfo: { ...single.providerInfo, coverage: { ...coverage, endDate: '2026-10-20' } } }
    const partialContext = { ...context, datasetRevision: getDatasetRevision(partial) }
    expect(seed({ meta: partial, context: partialContext, neighbors: [] })).toBe(true)
    expect(seed({ meta: partial, context: partialContext, neighbors: [{ ...schedule, date: '2026-10-20' }] })).toBe(true)
  } finally { vi.unstubAllGlobals() }
})
