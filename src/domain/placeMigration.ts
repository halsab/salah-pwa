import { DUM_RT_TIME_ZONE, getDeviceTimeZone, isValidTimeZone } from './locationTime'
import { createOfficialPlace, restorePlaceMetadata, type Place } from './place'
import { validPosition } from './localGeography'
import type { PrayerLocation, SavedCoordinates } from './types'
import type { LocationChoice } from '../storage/database'

export function restoreSavedCoordinates(value: unknown): SavedCoordinates | null {
  if (!value || typeof value !== 'object') return null
  const coordinates = value as Partial<SavedCoordinates>
  if (typeof coordinates.latitude !== 'number' || typeof coordinates.longitude !== 'number'
    || coordinates.accuracy === undefined || !validPosition(coordinates as SavedCoordinates)
    || !Number.isFinite(coordinates.timestamp)
    || (coordinates.name !== undefined && typeof coordinates.name !== 'string')
    || (coordinates.cityId !== undefined && !Number.isInteger(coordinates.cityId))
    || (coordinates.timeZone !== undefined && (typeof coordinates.timeZone !== 'string' || !isValidTimeZone(coordinates.timeZone)))) return null
  const { latitude, longitude, accuracy, timestamp, name, cityId } = coordinates as SavedCoordinates
  return {
    latitude, longitude, accuracy, timestamp, timeZone: coordinates.timeZone ?? getDeviceTimeZone(),
    ...(name === undefined ? {} : { name }), ...(cityId === undefined ? {} : { cityId }),
    ...(coordinates.source === 'gps' || coordinates.source === 'preset' ? { source: coordinates.source } : {}),
  }
}

function validNearbyCity(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const city = value as Record<string, unknown>
  if (!Number.isInteger(city.id) || typeof city.name !== 'string'
    || typeof city.distanceKm !== 'number' || !Number.isFinite(city.distanceKm)
    || city.distanceKm < 0) return false
  return true
}

export function isPlace(value: unknown): value is Place {
  if (!value || typeof value !== 'object') return false
  const place = value as Partial<Place>
  const legacyOverride = (value as { timeZoneOverride?: unknown }).timeZoneOverride
  return Boolean(restoreSavedCoordinates(value) && typeof place.id === 'string' && place.id
    && typeof place.name === 'string' && ['gps', 'city', 'official'].includes(place.selection ?? '')
    && ['inside', 'outside', 'uncertain', 'unavailable'].includes(place.coverage ?? '')
    && (place.region === null || (place.region && typeof place.region.code === 'string' && typeof place.region.name === 'string'))
    && (place.nearbyCity === undefined || validNearbyCity(place.nearbyCity))
    && place.automaticTimeZone && typeof place.automaticTimeZone.id === 'string' && isValidTimeZone(place.automaticTimeZone.id)
    && ['city', 'boundary', 'device', 'legacy'].includes(place.automaticTimeZone.source)
    && (legacyOverride === undefined || place.selection === 'gps' || place.selection === 'official' || (Boolean(legacyOverride) && typeof legacyOverride === 'object'
      && (legacyOverride as { source?: unknown }).source === 'user'
      && typeof (legacyOverride as { id?: unknown }).id === 'string'
      && isValidTimeZone((legacyOverride as { id: string }).id)))
  )
}

export function placeFromChoice(choice: LocationChoice, locations: PrayerLocation[]): Place | null {
  if (isPlace(choice.place)) {
    const place = choice.place
    const regionCode = place.region?.code
    const validCityRegion = regionCode && (/^[A-Z]{2}(?:\.[A-Z0-9]{1,3})?$/.test(regionCode)
      || (regionCode === 'RU-TA' && place.coverage === 'inside'))
    const region = place.selection === 'city' && place.region?.code
      && !validCityRegion
      ? null
      : place.region
    const { timeZoneOverride: _legacyOverride, ...withoutOverride } = place as Place & { timeZoneOverride?: unknown }
    const timeZone = place.selection === 'gps' ? getDeviceTimeZone()
      : place.selection === 'official' ? DUM_RT_TIME_ZONE
        : place.automaticTimeZone.id
    const automaticTimeZone = place.selection === 'gps'
      ? { id: timeZone, source: 'device' as const }
      : place.selection === 'official'
        ? { id: timeZone, source: 'city' as const }
        : place.automaticTimeZone
    return restorePlaceMetadata({ ...withoutOverride, region, timeZone, automaticTimeZone })
  }
  if (choice.mode === 'official') {
    const location = locations.find(item => item.id === choice.locationId)
    return location ? createOfficialPlace(location, 0) : null
  }
  const coordinates = restoreSavedCoordinates(choice.coordinates)
  if (!coordinates) return null
  const selection = coordinates.source === 'preset' ? 'city' : 'gps'
  return {
    ...coordinates,
    id: coordinates.cityId && selection === 'city' ? `geonames:${coordinates.cityId}` : `saved:${coordinates.timestamp}`,
    selection, name: coordinates.name ?? '',
    region: null, coverage: 'unavailable',
    // Старая запись не доказывает происхождение зоны; сохраняем её до локального уточнения.
    timeZone: selection === 'gps' ? getDeviceTimeZone() : coordinates.timeZone,
    automaticTimeZone: selection === 'gps'
      ? { id: getDeviceTimeZone(), source: 'device' }
      : { id: coordinates.timeZone, source: 'legacy' },
  }
}

export function migratePlaceChoice(choice: LocationChoice, locations: PrayerLocation[]): LocationChoice {
  const place = placeFromChoice(choice, locations)
  if (!place) return choice
  return choice.mode === 'official' ? { ...choice, place } : { ...choice, coordinates: place, place }
}
