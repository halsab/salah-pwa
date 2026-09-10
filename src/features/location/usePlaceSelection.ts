import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppServices } from '../../App'
import type { LocationChoice } from '../../storage/database'
import type { LocationSelectionSource } from '../../domain/locationSelection'
import { shouldStartAutomaticLocation } from '../../domain/locationSelection'
import { createCityPlace, createGpsPlace, createOfficialPlace, isFreshGpsPlace, isUsefulRefinement, officialLocationForPlace, refineGpsPlace, setPlaceTimeZone, withNearbyCity, type Place } from '../../domain/place'
import { placeFromChoice } from '../../domain/placeMigration'
import { validPosition } from '../../domain/localGeography'
import type { City } from '../../domain/cities'
import type { GeolocationFailure } from '../../domain/errors'
import type { PrayerLocation } from '../../domain/types'

function locationError(error: GeolocationFailure): string {
  if (error.reason === 'denied') return 'Доступ к геопозиции запрещён'
  if (error.reason === 'unsupported') return 'Геопозиция не поддерживается'
  if (error.reason === 'timeout') return 'Не удалось определить местоположение вовремя'
  return 'Не удалось определить местоположение'
}

export function usePlaceSelection(services: AppServices, locations: PrayerLocation[], onChosen: () => void, persist: (choice: LocationChoice) => void) {
  const [place, setPlace] = useState<Place | null>(null)
  const [source, setSource] = useState<LocationSelectionSource>('default')
  const [notice, setNotice] = useState<string | null>(null)
  const current = useRef<Place | null>(null)
  const epoch = useRef(0)
  const started = useRef(false)
  const restored = useRef(false)
  useEffect(() => () => { epoch.current += 1 }, [])

  const apply = useCallback((next: Place, selectionSource: LocationSelectionSource, operation: number) => {
    if (operation !== epoch.current) return
    current.current = next
    setPlace(next)
    setSource(selectionSource)
    const official = officialLocationForPlace(next, locations)
    persist(official
      ? { mode: 'official', locationId: official.id, source: selectionSource, place: next }
      : { mode: 'calculated', coordinates: next, source: selectionSource, place: next })
  }, [locations, persist])

  const restore = useCallback((choice: LocationChoice | null, availableLocations: PrayerLocation[]) => {
    if (restored.current || current.current) return
    restored.current = true
    if (!choice) { started.current = true; return }
    const saved = placeFromChoice(choice, availableLocations)
    current.current = saved
    setPlace(saved)
    setSource(choice.source)
  }, [])

  const locate = useCallback(async (interactive = true, existingEpoch?: number) => {
    const operation = existingEpoch ?? ++epoch.current
    started.current = true
    setNotice(null)
    const previous = current.current?.selection === 'gps' ? current.current : null
    const geometry = services.loadGeography().catch(() => null)
    let best: Place | null = null
    let preciseAccepted = false
    let revision = 0
    let lastError: GeolocationFailure = { kind: 'geolocation', reason: 'unavailable' }
    const receive = async (accuracy: 'coarse' | 'precise') => {
      try {
        const result = await services.getPosition(accuracy)
        if (operation !== epoch.current) return
        if (!result.ok) { lastError = result.error; return }
        if (!validPosition(result.value) || !Number.isFinite(result.value.timestamp)) return
        const data = await geometry
        if (operation !== epoch.current || (accuracy === 'coarse' && preciseAccepted)) return
        const base = best ?? previous
        const next = base
          ? refineGpsPlace(base, result.value, services.getDeviceTimeZone(), data)
          : createGpsPlace(result.value, services.getDeviceTimeZone(), data, `gps:${operation}:${result.value.timestamp}`)
        if (best && !isUsefulRefinement(best, next)) return
        if (accuracy === 'precise') preciseAccepted = true
        best = next
        const lookupRevision = ++revision
        apply(next, 'automatic', operation)
        if (interactive && lookupRevision === 1) onChosen()
        // Название не задерживает расписание и не доказывает регион или timezone.
        void services.cities.findNearest(next.latitude, next.longitude, 25, true).then(result => {
          if (operation !== epoch.current || lookupRevision !== revision || !result.ok) return
          const active = current.current
          if (!active) return
          const named = withNearbyCity(active, result.value)
          if (named !== active) apply(named, 'automatic', operation)
        }).catch(() => undefined)
      } catch {
        lastError = { kind: 'geolocation', reason: 'unavailable' }
      }
    }
    // getCurrentPosition не отменяется AbortController; epoch отсекает обе одноразовые операции.
    await Promise.all([receive('coarse'), receive('precise')])
    if (operation !== epoch.current || revision > 0) return
    if (interactive) throw new Error(locationError(lastError))
    setNotice(`${locationError(lastError)}. Сохранённое место остаётся доступным.`)
  }, [apply, onChosen, services])

  useEffect(() => {
    if (!place || started.current || !shouldStartAutomaticLocation({ source }) || isFreshGpsPlace(place, services.now().getTime())) return
    started.current = true
    const operation = ++epoch.current
    void services.getPermission().then(permission => {
      if (operation === epoch.current && permission === 'granted') void locate(false, operation)
    }).catch(() => undefined)
  }, [locate, place, services, source])

  const selectOfficial = useCallback((id: string) => {
    const location = locations.find(item => item.id === id)
    if (!location) return
    setNotice(null)
    apply(createOfficialPlace(location, services.now().getTime()), 'manual', ++epoch.current)
    onChosen()
  }, [apply, locations, onChosen, services])
  const selectCity = useCallback((city: City) => {
    setNotice(null)
    apply(createCityPlace(city, services.now().getTime()), 'manual', ++epoch.current)
    onChosen()
  }, [apply, onChosen, services])
  const selectRecent = useCallback((recent: Place) => {
    if (recent.selection === 'gps') return
    setNotice(null)
    apply({ ...recent, timestamp: services.now().getTime() }, 'manual', ++epoch.current)
    onChosen()
  }, [apply, onChosen, services])
  const changeTimeZone = useCallback(async (zone: string | null): Promise<string> => {
    const selected = current.current
    if (!selected) return services.getDeviceTimeZone()
    const operation = ++epoch.current
    // Настройка зоны прерывает ожидающие GPS/lookup, поэтому override не теряется при гонке.
    let updated = setPlaceTimeZone(selected, zone)
    if (zone === null && selected.selection === 'gps') {
      const geometry = await services.loadGeography().catch(() => null)
      if (operation !== epoch.current) return current.current?.timeZone ?? selected.timeZone
      const resolved = createGpsPlace(selected, services.getDeviceTimeZone(), geometry, selected.id)
      updated = { ...updated, timeZone: resolved.timeZone, automaticTimeZone: resolved.automaticTimeZone,
        coverage: resolved.coverage, region: resolved.region }
    }
    apply(updated, source, operation)
    return updated.timeZone
  }, [apply, services, source])
  const invalidate = useCallback(() => { epoch.current += 1; started.current = true }, [])
  return { place, source, notice, restore, locate, selectOfficial, selectCity, selectRecent, changeTimeZone, invalidate }
}
