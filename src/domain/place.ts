import { formatCityLabel, type City } from './cities'
import { findNearestLocation, haversineDistanceKm, isConfirmedTatarstan } from './location'
import { resolveGpsGeography, validPosition, type Coverage, type CoverageGeometry } from './localGeography'
import { DUM_RT_TIME_ZONE, isValidTimeZone } from './locationTime'
import type { PrayerLocation, SavedCoordinates } from './types'

export interface Place extends SavedCoordinates {
  id: string
  selection: 'gps' | 'city' | 'official'
  name: string
  region: { code: string; name: string } | null
  coverage: Coverage
  automaticTimeZone: { id: string; source: 'city' | 'boundary' | 'device' | 'legacy' }
  timeZoneOverride?: { id: string; source: 'user' }
  nearbyCity?: { id: number; name: string; distanceKm: number }
}

type Fix = Pick<SavedCoordinates, 'latitude' | 'longitude' | 'accuracy' | 'timestamp'>
const TATARSTAN = { code: 'RU-TA', name: 'Татарстан' }

export function createGpsPlace(fix: Fix, deviceZone: string, geometry: CoverageGeometry | null, id: string): Place {
  const geography = resolveGpsGeography(fix, deviceZone, geometry)
  return {
    latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy, timestamp: fix.timestamp,
    id, selection: 'gps', name: 'Моё местоположение',
    region: geography.coverage === 'inside' ? TATARSTAN : null,
    coverage: geography.coverage, timeZone: geography.timeZone,
    automaticTimeZone: { id: geography.timeZone, source: geography.timeZoneSource },
  }
}

export function createCityPlace(city: City, timestamp: number): Place {
  if (!isValidTimeZone(city.timeZone)) throw new RangeError('Неизвестная часовая зона города')
  const tatarstan = isConfirmedTatarstan({ source: 'geonames', countryCode: city.countryCode, admin1Code: city.admin1Code })
  return {
    id: `geonames:${city.id}`, selection: 'city', cityId: city.id,
    name: formatCityLabel(city), latitude: city.latitude, longitude: city.longitude,
    accuracy: null, timestamp, timeZone: city.timeZone,
    automaticTimeZone: { id: city.timeZone, source: 'city' },
    region: tatarstan ? TATARSTAN : { code: `${city.countryCode}.${city.admin1Code}`, name: city.admin1Name },
    coverage: tatarstan ? 'inside' : 'outside',
  }
}

export function createOfficialPlace(location: PrayerLocation, timestamp: number): Place {
  return {
    ...location, id: `locality:${location.id}`, selection: 'official',
    accuracy: null, timestamp, timeZone: DUM_RT_TIME_ZONE,
    automaticTimeZone: { id: DUM_RT_TIME_ZONE, source: 'city' }, region: TATARSTAN, coverage: 'inside',
  }
}

export function setPlaceTimeZone(place: Place, timeZone: string | null): Place {
  const { timeZoneOverride: _oldOverride, ...base } = place
  if (timeZone === null) return { ...base, timeZone: base.automaticTimeZone.id }
  if (!isValidTimeZone(timeZone)) throw new RangeError('Введите действующую IANA timezone, например Europe/Moscow')
  return { ...base, timeZone, timeZoneOverride: { id: timeZone, source: 'user' } }
}

export function refineGpsPlace(place: Place, fix: Fix, deviceZone: string, geometry: CoverageGeometry | null): Place {
  const refined = createGpsPlace(fix, deviceZone, geometry, place.id)
  return place.timeZoneOverride ? setPlaceTimeZone(refined, place.timeZoneOverride.id) : refined
}

export function withNearbyCity(place: Place, city: City | null): Place {
  if (!city) return place
  const distanceKm = haversineDistanceKm(place.latitude, place.longitude, city.latitude, city.longitude)
  if (distanceKm > 25) return place
  return { ...place, name: `Рядом: ${city.name}`, nearbyCity: { id: city.id, name: formatCityLabel(city), distanceKm } }
}

export function officialLocationForPlace(place: Place, locations: PrayerLocation[]): PrayerLocation | null {
  if (place.coverage !== 'inside') return null
  if (place.selection === 'official') return locations.find(location => `locality:${location.id}` === place.id) ?? null
  // В пределах подтверждённой территории используем ближайший опубликованный пункт без радиуса.
  return findNearestLocation(place.latitude, place.longitude, locations)
}

export function isFreshGpsPlace(place: Place | null, now: number): boolean {
  return Boolean(place && place.selection === 'gps' && validPosition(place)
    && now >= place.timestamp && now - place.timestamp < 30 * 60_000)
}

export function isUsefulRefinement(previous: Place, next: Place): boolean {
  const oldAccuracy = previous.accuracy ?? Infinity
  const newAccuracy = next.accuracy ?? Infinity
  if (newAccuracy > oldAccuracy) return false
  const moved = haversineDistanceKm(previous.latitude, previous.longitude, next.latitude, next.longitude) * 1000
  return previous.coverage !== next.coverage
    || previous.automaticTimeZone.id !== next.automaticTimeZone.id
    || moved > Math.max(100, oldAccuracy + newAccuracy)
    || (oldAccuracy - newAccuracy >= 100 && newAccuracy <= oldAccuracy / 2)
}
