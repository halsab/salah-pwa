import type { Place } from './place'
import { isPlace } from './placeMigration'

export function restoreRecentPlaces(value: unknown, currentId?: string): Place[] {
  if (!Array.isArray(value)) return []
  const ids = new Set<string>()
  return value.filter((place): place is Place => {
    if (!isPlace(place) || place.selection === 'gps' || place.id === currentId || ids.has(place.id)) return false
    ids.add(place.id)
    return true
  }).slice(0, 3)
}

export function rememberPlace(recent: Place[], previous: Place | null, current: Place): Place[] {
  return restoreRecentPlaces([previous, ...recent], current.id)
}
