import { isCalculationSettings } from '../../domain/calculationSettings'
import { getSystemDate } from '../../domain/date'
import { isLocationSelectionSource } from '../../domain/locationSelection'
import { isPlace } from '../../domain/placeMigration'
import { gpsCountryCode } from '../../domain/place'
import { isPrayerDay } from '../../domain/prayerDatasetValidation'
import { scheduleContextKey, type ScheduleContext, getDatasetRevision } from '../../domain/scheduleContext'
import type { SourcePreferences } from '../../domain/sourcePreferences'
import { isSourcePreferences } from '../../domain/sourcePreferences'
import { DUM_RT_TIME_ZONE, isValidTimeZone } from '../../domain/locationTime'
import type { PrayerSchedule } from '../../domain/scheduleEvents'
import { CALCULATED_KEYS } from '../../domain/calculationSettings'
import type { CalculatedPrayerKey } from '../../domain/types'
import type { DatasetMeta } from '../../storage/database'
import type { Place } from '../../domain/place'
import type { LocationSelectionSource } from '../../domain/locationSelection'

const SNAPSHOT_KEY = 'salah:fast-schedule:v1'
const ACTIVE_CONTEXT_KEY = 'salah:fast-schedule-context:v1'
const CHANGE_SIGNAL_KEY = 'salah:fast-schedule-change:v1'
const SNAPSHOT_SCHEMA = 1
const SNAPSHOT_LIMIT_BYTES = 4_096
const MAX_AGE_MS = 24 * 60 * 60_000
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/
export const FAST_SCHEDULE_STORAGE_KEYS = {
  snapshot: SNAPSHOT_KEY, activeContext: ACTIVE_CONTEXT_KEY, changeSignal: CHANGE_SIGNAL_KEY,
} as const

export interface FastScheduleStartup {
  generation: string
  context: ScheduleContext
  schedule: PrayerSchedule
  place: Place
  selectionSource: LocationSelectionSource
  preferences: SourcePreferences
  meta: DatasetMeta | null
}

interface FastScheduleRecord extends FastScheduleStartup {
  schema: number
  appVersion: string
  savedAt: number
}

interface ActiveScheduleMarker {
  generation: string
  contextKey: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isCivilDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function isDatasetMeta(value: unknown, context: Extract<ScheduleContext, { source: 'official' }>): value is DatasetMeta {
  if (!isRecord(value) || !Array.isArray(value.locations) || !isRecord(value.source)) return false
  const meta = value as unknown as DatasetMeta
  const location = meta.locations.length === 1 ? meta.locations[0] : undefined
  if ((meta.schemaVersion !== 2 && meta.schemaVersion !== 3)
    || typeof meta.source.name !== 'string' || !meta.source.name
    || typeof meta.source.url !== 'string' || typeof meta.source.updatedAt !== 'string'
    || !Array.isArray(meta.source.years) || !meta.source.years.every(year => Number.isInteger(year))
    || !location || location.id !== context.localityId
    || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return false
  if (meta.provider !== undefined && meta.provider !== context.provider) return false
  if (meta.identity !== undefined && (!isRecord(meta.identity) || typeof meta.identity.version !== 'string'
    || typeof meta.identity.url !== 'string' || typeof meta.identity.sha256 !== 'string'
    || (meta.identity.sequence !== undefined && !Number.isInteger(meta.identity.sequence)))) return false
  if (meta.providerInfo !== undefined) {
    const info = meta.providerInfo
    if (!isRecord(info) || info.id !== context.provider || typeof info.revision !== 'string'
      || !isRecord(info.coverage)
      || !isValidTimeZone(info.timeZone) || typeof info.coverage.geographic !== 'string'
      || info.coverage.geographic !== context.coverage
      || !isCivilDate(info.coverage.startDate) || !isCivilDate(info.coverage.endDate)
      || context.date < info.coverage.startDate || context.date > info.coverage.endDate
      || info.timeZone !== context.timeZone) return false
  } else if (meta.schemaVersion === 3) {
    return false
  }
  if (meta.schemaVersion === 2 && !meta.source.years.includes(Number(context.date.slice(0, 4)))) {
    return false
  }
  return getDatasetRevision(meta) === context.datasetRevision
    && (meta.identity?.version ?? meta.source.updatedAt) === context.datasetVersion
}

function isContext(value: unknown): value is ScheduleContext {
  if (!isRecord(value) || !isRecord(value.location) || !isCivilDate(value.date)
    || typeof value.timeZone !== 'string' || !isValidTimeZone(value.timeZone)
    || (value.mode !== 'automatic' && value.mode !== 'manual')
    || typeof value.location.latitude !== 'number' || !Number.isFinite(value.location.latitude)
    || Math.abs(value.location.latitude) > 90
    || typeof value.location.longitude !== 'number' || !Number.isFinite(value.location.longitude)
    || Math.abs(value.location.longitude) > 180
    || !(typeof value.location.id === 'string' || value.location.id === null)) return false
  if (value.source === 'official') {
    return typeof value.provider === 'string' && typeof value.datasetRevision === 'string'
      && typeof value.datasetVersion === 'string' && typeof value.coverage === 'string'
      && typeof value.localityId === 'string'
  }
  return value.source === 'calculated' && isCalculationSettings(value.settings)
}

function isCachedPlace(value: unknown): value is Place {
  return isPlace(value) && value.accuracy === null && Number.isFinite(value.timestamp) && value.timestamp >= 0
    && value.cityId === undefined && value.source === undefined
    && (value.nearbyCity === undefined || gpsCountryCode(value) !== undefined)
}

function isCalculatedSchedule(value: unknown, context: Extract<ScheduleContext, { source: 'calculated' }>): value is PrayerSchedule {
  if (!isRecord(value) || value.date !== context.date || value.timeZone !== context.timeZone
    || value.profile !== context.settings.profile || !isRecord(value.entries)
    || !Array.isArray(value.estimatedPrayers)
    || !value.estimatedPrayers.every(key => CALCULATED_KEYS.includes(key as CalculatedPrayerKey))
    || typeof value.polarResolutionApplied !== 'boolean') return false
  const entries = value.entries
  return CALCULATED_KEYS.every((key: CalculatedPrayerKey) => {
    const entry = entries[key]
    return isRecord(entry) && typeof entry.time === 'string' && TIME_PATTERN.test(entry.time)
      && typeof entry.instant === 'number' && Number.isFinite(entry.instant)
      && typeof entry.estimated === 'boolean'
  })
}

function isSchedule(value: unknown, context: ScheduleContext, meta: DatasetMeta | null): value is PrayerSchedule {
  if (context.source === 'official') {
    return isPrayerDay(value, meta?.schemaVersion)
      && value.date === context.date && value.locationId === context.localityId
      && value.timeZone === context.timeZone
      && value.coordinates?.latitude === context.location.latitude
      && value.coordinates.longitude === context.location.longitude
  }
  return isCalculatedSchedule(value, context)
}

function checksum(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

function storage(): Storage | null {
  try { return globalThis.localStorage } catch { return null }
}

function newGeneration(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function readMarker(store: Storage): ActiveScheduleMarker | null {
  try {
    const value: unknown = JSON.parse(store.getItem(ACTIVE_CONTEXT_KEY) ?? 'null')
    return isRecord(value) && typeof value.generation === 'string'
      && (value.contextKey === null || typeof value.contextKey === 'string')
      ? { generation: value.generation, contextKey: value.contextKey }
      : null
  } catch {
    return null
  }
}

function rotateGeneration(store: Storage): string | null {
  const generation = newGeneration()
  try {
    store.setItem(ACTIVE_CONTEXT_KEY, JSON.stringify({ generation, contextKey: null } satisfies ActiveScheduleMarker))
    store.removeItem(SNAPSHOT_KEY)
    return generation
  } catch {
    return null
  }
}

export function currentFastScheduleGeneration(): string | null {
  const store = storage()
  if (!store) return null
  return readMarker(store)?.generation ?? rotateGeneration(store)
}

function decodeRecord(raw: string): FastScheduleRecord | null {
  try {
    const envelope: unknown = JSON.parse(raw)
    if (!isRecord(envelope) || typeof envelope.payload !== 'string'
      || typeof envelope.checksum !== 'string' || checksum(envelope.payload) !== envelope.checksum) return null
    const record: unknown = JSON.parse(envelope.payload)
    return isRecord(record) ? record as unknown as FastScheduleRecord : null
  } catch {
    return null
  }
}

function validRecord(record: FastScheduleRecord, input: { appVersion: string; now: Date; deviceTimeZone: string }): boolean {
  if (record.schema !== SNAPSHOT_SCHEMA || record.appVersion !== input.appVersion
    || typeof record.generation !== 'string' || !record.generation
    || typeof record.savedAt !== 'number' || !Number.isFinite(record.savedAt)
    || record.savedAt > input.now.getTime() + 60_000
    || input.now.getTime() - record.savedAt > MAX_AGE_MS
    || !isContext(record.context) || !isCachedPlace(record.place)
    || !isLocationSelectionSource(record.selectionSource) || !isSourcePreferences(record.preferences)) return false
  const context = record.context
  if (record.place.id !== context.location.id || record.place.latitude !== context.location.latitude
    || record.place.longitude !== context.location.longitude
    || getSystemDate(input.now, context.timeZone) !== context.date) return false
  if (record.place.selection === 'gps' && (record.place.timeZone !== input.deviceTimeZone
    || record.place.automaticTimeZone.id !== input.deviceTimeZone
    || (context.source === 'calculated' && context.timeZone !== input.deviceTimeZone)
    || (context.source === 'official' && (context.timeZone !== DUM_RT_TIME_ZONE || context.provider !== 'dumRt')))) return false
  if (context.source === 'official' && (context.timeZone !== DUM_RT_TIME_ZONE || context.provider !== 'dumRt'
    || (record.place.selection === 'official' && record.place.timeZone !== DUM_RT_TIME_ZONE)
    || (record.place.selection === 'city' && record.place.timeZone !== record.place.automaticTimeZone.id))) return false
  if (context.source === 'calculated' && record.place.selection !== 'gps' && record.place.timeZone !== context.timeZone) return false
  if (record.place.selection === 'official' && context.source === 'official'
    && (context.timeZone !== DUM_RT_TIME_ZONE || context.provider !== 'dumRt')) return false
  const meta = context.source === 'official'
    ? record.meta !== null && isDatasetMeta(record.meta, context) ? record.meta : undefined
    : record.meta === null ? null : undefined
  if (meta === undefined || (context.source === 'official' && !meta)) return false
  return isSchedule(record.schedule, context, meta)
}

export function readFastScheduleSnapshot(input: {
  appVersion: string
  now: Date
  deviceTimeZone: string
}): FastScheduleStartup | null {
  const store = storage()
  if (!store) return null
  try {
    const marker = readMarker(store) ?? (() => {
      const generation = rotateGeneration(store)
      return generation ? { generation, contextKey: null } : null
    })()
    if (!marker) return null
    const raw = store.getItem(SNAPSHOT_KEY)
    if (!raw) {
      if (marker.contextKey !== null) rotateGeneration(store)
      return null
    }
    if (byteLength(raw) > SNAPSHOT_LIMIT_BYTES) {
      rotateGeneration(store)
      return null
    }
    const record = decodeRecord(raw)
    if (!record || !validRecord(record, input)) {
      rotateGeneration(store)
      return null
    }
    const key = scheduleContextKey(record.context)
    if (marker.generation !== record.generation || marker.contextKey !== key) {
      rotateGeneration(store)
      return null
    }
    return { generation: record.generation, context: record.context, schedule: record.schedule, place: record.place,
      selectionSource: record.selectionSource, preferences: record.preferences, meta: record.meta }
  } catch {
    return null
  }
}

export function activateFastScheduleContext(contextKey: string, generation: string): boolean {
  const store = storage()
  if (!store || !generation) return false
  try {
    const marker = readMarker(store)
    if (!marker || marker.generation !== generation
      || (marker.contextKey !== null && marker.contextKey !== contextKey)) return false
    store.setItem(ACTIVE_CONTEXT_KEY, JSON.stringify({ generation, contextKey } satisfies ActiveScheduleMarker))
    return true
  } catch {
    return false
  }
}

export function invalidateFastScheduleSnapshot(): string | null {
  const store = storage()
  if (!store) return null
  return rotateGeneration(store)
}

export function notifyFastScheduleSelectionChanged(): void {
  const store = storage()
  if (!store) return
  try { store.setItem(CHANGE_SIGNAL_KEY, `${Date.now()}:${Math.random()}`) } catch { /* Cross-tab sync is optional. */ }
}

function cacheMeta(meta: DatasetMeta | null, context: ScheduleContext): DatasetMeta | null {
  if (context.source !== 'official' || !meta) return null
  const location = meta.locations.find(item => item.id === context.localityId)
  return location ? { ...meta, locations: [location] } : null
}

function cachePlace(place: Place): Place {
  // Для freshness достаточно времени последнего фикса; country hint нужен автоматическому профилю.
  const { accuracy: _accuracy, nearbyCity: _nearbyCity,
    cityId: _cityId, source: _source, ...displayPlace } = place
  const countryCode = gpsCountryCode(place)
  const city = place.nearbyCity
  const nearbyCity = countryCode && city && typeof city.latitude === 'number' && typeof city.longitude === 'number' ? {
    id: city.id,
    name: city.name,
    distanceKm: city.distanceKm,
    countryCode,
    latitude: city.latitude,
    longitude: city.longitude,
  } : undefined
  return { ...displayPlace, ...(nearbyCity ? { nearbyCity } : {}), accuracy: null, timestamp: place.timestamp }
}

export function writeFastScheduleSnapshot(input: {
  appVersion: string
  now: Date
  deviceTimeZone: string
  context: ScheduleContext
  schedule: PrayerSchedule
  place: Place
  selectionSource: LocationSelectionSource
  preferences: SourcePreferences
  meta: DatasetMeta | null
  generation: string | null
}): boolean {
  const store = storage()
  if (!store) return false
  try {
    const key = scheduleContextKey(input.context)
    const marker = readMarker(store)
    if (!input.generation || marker?.generation !== input.generation || marker.contextKey !== key) return false
    const record: FastScheduleRecord = {
      schema: SNAPSHOT_SCHEMA,
      generation: input.generation,
      appVersion: input.appVersion,
      savedAt: input.now.getTime(),
      context: input.context,
      schedule: input.schedule,
      place: cachePlace(input.place),
      selectionSource: input.selectionSource,
      preferences: input.preferences,
      meta: cacheMeta(input.meta, input.context),
    }
    if (input.context.source === 'official' && !record.meta) return false
    if (!validRecord(record, { appVersion: input.appVersion, now: input.now, deviceTimeZone: input.deviceTimeZone })) return false
    const payload = JSON.stringify(record)
    const encoded = JSON.stringify({ payload, checksum: checksum(payload) })
    if (byteLength(encoded) > SNAPSHOT_LIMIT_BYTES) {
      store.removeItem(SNAPSHOT_KEY)
      return false
    }
    store.setItem(SNAPSHOT_KEY, encoded)
    return true
  } catch {
    return false
  }
}

