import { getDeviceTimeZone, isValidTimeZone } from './locationTime'
import { createOfficialPlace, type Place } from './place'
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

function isPlace(value: unknown): value is Place {
  if (!value || typeof value !== 'object') return false
  const place = value as Partial<Place>
  return Boolean(restoreSavedCoordinates(value) && typeof place.id === 'string' && place.id
    && typeof place.name === 'string' && ['gps', 'city', 'official'].includes(place.selection ?? '')
    && ['inside', 'outside', 'uncertain', 'unavailable'].includes(place.coverage ?? '')
    && (place.region === null || (place.region && typeof place.region.code === 'string' && typeof place.region.name === 'string'))
    && place.automaticTimeZone && typeof place.automaticTimeZone.id === 'string' && isValidTimeZone(place.automaticTimeZone.id)
    && ['city', 'boundary', 'device', 'legacy'].includes(place.automaticTimeZone.source)
    && (place.timeZoneOverride === undefined || ((place.timeZoneOverride as { source?: unknown }).source === 'user' && typeof place.timeZoneOverride.id === 'string' && isValidTimeZone(place.timeZoneOverride.id))))
}

export function placeFromChoice(choice: LocationChoice, locations: PrayerLocation[]): Place | null {
  if (isPlace(choice.place)) return { ...choice.place, timeZone: choice.place.timeZoneOverride?.id ?? choice.place.automaticTimeZone.id }
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
    selection, name: coordinates.name ?? 'Моё местоположение',
    region: null, coverage: 'unavailable',
    // Старая запись не доказывает происхождение зоны; сохраняем её до локального уточнения.
    automaticTimeZone: { id: coordinates.timeZone, source: 'legacy' },
  }
}

export function migratePlaceChoice(choice: LocationChoice, locations: PrayerLocation[]): LocationChoice {
  const place = placeFromChoice(choice, locations)
  if (!place) return choice
  return choice.mode === 'official' ? { ...choice, place } : { ...choice, coordinates: place, place }
}
