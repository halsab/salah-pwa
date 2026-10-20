import { DUM_RT_TIME_ZONE, getDeviceTimeZone } from './locationTime'
import type { Place } from './place'
import { restorePlaceMetadata } from './place'
import { isPlace } from './placeMigration'

export const MAX_RECENT_PLACES = 10
export const GPS_HISTORY_DEDUPE_METERS = 500

function distanceMeters(a: Place, b: Place): number {
  const radians = (degrees: number) => degrees * Math.PI / 180
  const latitudeDelta = radians(b.latitude - a.latitude)
  const longitudeDelta = radians(b.longitude - a.longitude)
  const firstLatitude = radians(a.latitude)
  const secondLatitude = radians(b.latitude)
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

function gpsIdentity(place: Place): string {
  // Новая identity снимка не зависит от epoch запроса, времени фиксации или подписи.
  return `gps:history:${place.latitude.toFixed(6)}:${place.longitude.toFixed(6)}`
}

function historyIdentity(place: Place): string {
  return place.id.startsWith('gps:history:') ? place.id : gpsIdentity(place)
}

function canonicalPlace(place: Place): Place {
  const { timeZoneOverride: _legacyOverride, ...withoutLegacyOverride } = place as Place & { timeZoneOverride?: unknown }
  const restored = restorePlaceMetadata(withoutLegacyOverride)
  if (restored.selection === 'gps') {
    const timeZone = getDeviceTimeZone()
    return { ...restored, timeZone, automaticTimeZone: { id: timeZone, source: 'device' } }
  }
  if (restored.selection === 'official') {
    return { ...restored, timeZone: DUM_RT_TIME_ZONE, automaticTimeZone: { id: DUM_RT_TIME_ZONE, source: 'city' } }
  }
  return restored
}

function sameIdentity(a: Place, b: Place): boolean {
  if (a.selection !== b.selection) return false
  if (a.selection !== 'gps') return a.id === b.id
  return a.id === b.id || distanceMeters(a, b) <= GPS_HISTORY_DEDUPE_METERS
}

function findGpsMatch(places: readonly Place[], candidate: Place): Place | undefined {
  return places
    .filter(place => place.selection === 'gps')
    .map((place, index) => ({ place, index, distance: distanceMeters(place, candidate) }))
    .filter(entry => entry.distance <= GPS_HISTORY_DEDUPE_METERS)
    .sort((a, b) => a.distance - b.distance || a.index - b.index)[0]?.place
}

function mergeInto(places: Place[], candidate: Place, promote: boolean): Place[] {
  const matched = candidate.selection === 'gps'
    ? places.find(place => place.selection === 'gps' && place.id === candidate.id) ?? findGpsMatch(places, candidate)
    : places.find(place => place.selection === candidate.selection && place.id === candidate.id)
  const normalized = canonicalPlace({ ...candidate, id: matched?.id ?? (candidate.selection === 'gps' ? gpsIdentity(candidate) : candidate.id) })
  if (!matched) return [normalized, ...places]
  return promote
    ? [normalized, ...places.filter(place => place !== matched)]
    : places.map(place => place === matched ? normalized : place)
}

/** Нормализует сохранённую историю и один раз добавляет уже выбранное место при миграции. */
export function restoreRecentPlaces(value: unknown, current?: Place | string | null): Place[] {
  const currentPlace = current && typeof current !== 'string' && isPlace(current) ? canonicalPlace(current) : null
  const source = Array.isArray(value) ? value : []
  const valid = source.filter(isPlace).map(canonicalPlace)
  const normalized: Place[] = []
  for (const place of valid) {
    const match = place.selection === 'gps'
      ? findGpsMatch(normalized, place)
      : normalized.find(item => item.selection === place.selection && item.id === place.id)
    if (match) continue
    normalized.push({ ...place, id: place.selection === 'gps' ? historyIdentity(place) : place.id })
  }
  if (currentPlace) {
    const alreadyStored = currentPlace.selection === 'gps'
      ? Boolean(findGpsMatch(normalized, currentPlace))
      : normalized.some(item => item.selection === currentPlace.selection && item.id === currentPlace.id)
    if (!alreadyStored) normalized.unshift({ ...currentPlace, id: currentPlace.selection === 'gps' ? historyIdentity(currentPlace) : currentPlace.id })
  }
  return normalized.slice(0, MAX_RECENT_PLACES)
}

/** Поднимает явно выбранный снимок, сохраняя найденную GPS identity. */
export function rememberPlace(recent: Place[], selected: Place): Place[] {
  return mergeInto(recent, selected, true).slice(0, MAX_RECENT_PLACES)
}

/** Обогащает GPS-снимок только после подтверждения его связи с принятой операцией. */
export function updateRecentPlace(recent: Place[], selected: Place, historyId?: string): Place[] {
  if (selected.selection !== 'gps') return recent
  const matched = historyId ? recent.find(place => place.id === historyId) : findGpsMatch(recent, selected)
  if (!matched) return recent
  const normalized = canonicalPlace({ ...selected, id: matched.id })
  return recent.map(place => place === matched ? normalized : place).slice(0, MAX_RECENT_PLACES)
}

export function isSameRecentPlace(a: Place, b: Place): boolean {
  return sameIdentity(a, b)
}
