import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDatasetRevision, scheduleContextKey, type ScheduleContext } from '../../domain/scheduleContext'
import { automaticPreferences } from '../../domain/sourcePreferences'
import type { PrayerDay } from '../../domain/types'
import type { DatasetMeta } from '../../storage/database'
import { createOfficialPlace } from '../../domain/place'
import { DEFAULT_CALCULATION_SETTINGS } from '../../domain/prayerCalculation'
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
    expect(restored?.place.timestamp).toBe(0)
    expect(restored?.place.accuracy).toBeNull()
    expect(restored?.place.nearbyCity).toBeUndefined()
    expect(restored?.place.cityId).toBeUndefined()
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
