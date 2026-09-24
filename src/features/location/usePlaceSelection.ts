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
import { geolocationFailureMessage, isLowAccuracy, preferredGeolocationFailure, type GpsUiState, type NameLookupState } from './locationState'

export function usePlaceSelection(services: AppServices, locations: PrayerLocation[], onChosen: () => void, persist: (choice: LocationChoice) => void) {
  const [place, setPlace] = useState<Place | null>(null)
  const [source, setSource] = useState<LocationSelectionSource>('default')
  const [notice, setNotice] = useState<string | null>(null)
  const [gpsState, setGpsState] = useState<GpsUiState>({ status: 'idle' })
  const [nameLookupState, setNameLookupState] = useState<NameLookupState>('idle')
  const current = useRef<Place | null>(null)
  const epoch = useRef(0)
  const activeInteractive = useRef<{ operation: number; navigated: boolean } | null>(null)
  const started = useRef(false)
  const restored = useRef(false)
  useEffect(() => () => { epoch.current += 1; activeInteractive.current = null }, [])

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

  const finishInteractive = useCallback((operation: number) => {
    const active = activeInteractive.current
    if (!active || active.operation !== operation || active.navigated) return
    active.navigated = true
    onChosen()
  }, [onChosen])

  const locate = useCallback(async (interactive = true, existingEpoch?: number) => {
    const operation = existingEpoch ?? ++epoch.current
    started.current = true
    setNotice(null)
    setNameLookupState('idle')
    if (interactive) {
      activeInteractive.current = { operation, navigated: false }
      setGpsState({ status: 'locating' })
    } else {
      activeInteractive.current = null
    }
    const previous = current.current?.selection === 'gps' ? current.current : null
    const geometry = services.loadGeography().catch(() => null)
    const operationResult: { best: Place | null } = { best: null }
    let preciseAccepted = false
    let revision = 0
    const failures: GeolocationFailure[] = []
    const finished = { coarse: false, precise: false }

    const lookupName = (next: Place, lookupRevision: number) => {
      setNameLookupState('loading')
      // Интерактивный запрос может загрузить только вычисленный spatial package; фон остаётся local-only.
      void services.cities.findNearest(next.latitude, next.longitude, 25, !interactive).then(result => {
        if (operation !== epoch.current || lookupRevision !== revision) return
        if (!result.ok) {
          setNameLookupState(result.error.reason === 'offline' ? 'offline' : 'failed')
          return
        }
        if (!result.value) {
          setNameLookupState('not-found')
          return
        }
        const active = current.current
        if (!active || active.selection !== 'gps') return
        const named = withNearbyCity(active, result.value)
        if (named !== active) apply(named, 'automatic', operation)
        setNameLookupState('resolved')
      }).catch(() => {
        if (operation === epoch.current && lookupRevision === revision) setNameLookupState('failed')
      })
    }

    const receive = async (accuracy: 'coarse' | 'precise') => {
      try {
        const result = await services.getPosition(accuracy)
        if (operation !== epoch.current) return
        if (!result.ok) { failures.push(result.error); return }
        if (!validPosition(result.value) || !Number.isFinite(result.value.timestamp)) {
          failures.push({ kind: 'geolocation', reason: 'unavailable' })
          return
        }
        const data = await geometry
        if (operation !== epoch.current || (accuracy === 'coarse' && preciseAccepted)) return
        const base = operationResult.best ?? previous
        const next = base
          ? refineGpsPlace(base, result.value, services.getDeviceTimeZone(), data)
          : createGpsPlace(result.value, services.getDeviceTimeZone(), data, `gps:${operation}:${result.value.timestamp}`)
        if (operationResult.best && !isUsefulRefinement(operationResult.best, next)) {
          if (accuracy === 'precise') preciseAccepted = true
          return
        }
        if (accuracy === 'precise') preciseAccepted = true
        operationResult.best = next
        const lookupRevision = ++revision
        apply(next, 'automatic', operation)
        lookupName(next, lookupRevision)
        if (interactive) {
          const lowAccuracy = isLowAccuracy(next.accuracy)
          if (!lowAccuracy) {
            setGpsState({ status: 'ready', lowAccuracy: false })
            finishInteractive(operation)
          } else if (accuracy === 'coarse' && !finished.precise) {
            setGpsState({ status: 'refining' })
          } else {
            setGpsState({ status: 'ready', lowAccuracy: true })
          }
        }
      } catch {
        failures.push({ kind: 'geolocation', reason: 'unavailable' })
      } finally {
        finished[accuracy] = true
        if (interactive && operation === epoch.current && accuracy === 'precise' && operationResult.best && isLowAccuracy(operationResult.best.accuracy)) {
          setGpsState({ status: 'ready', lowAccuracy: true })
        }
      }
    }
    // getCurrentPosition не отменяется AbortController; epoch отсекает обе одноразовые операции.
    await Promise.all([receive('coarse'), receive('precise')])
    if (operation !== epoch.current) return
    if (operationResult.best) {
      if (interactive && isLowAccuracy(operationResult.best.accuracy)) setGpsState({ status: 'ready', lowAccuracy: true })
      return
    }
    const reason = preferredGeolocationFailure(failures.map(error => error.reason))
    if (interactive) setGpsState({ status: 'error', reason })
    else setNotice(`${geolocationFailureMessage(reason)} Сохранённое место остаётся доступным.`)
  }, [apply, finishInteractive, services])

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
    setGpsState({ status: 'idle' })
    setNameLookupState('idle')
    activeInteractive.current = null
    apply(createOfficialPlace(location, services.now().getTime()), 'manual', ++epoch.current)
    onChosen()
  }, [apply, locations, onChosen, services])
  const selectCity = useCallback((city: City) => {
    setNotice(null)
    setGpsState({ status: 'idle' })
    setNameLookupState('idle')
    activeInteractive.current = null
    apply(createCityPlace(city, services.now().getTime()), 'manual', ++epoch.current)
    onChosen()
  }, [apply, onChosen, services])
  const selectRecent = useCallback((recent: Place) => {
    if (recent.selection === 'gps') return
    setNotice(null)
    setGpsState({ status: 'idle' })
    setNameLookupState('idle')
    activeInteractive.current = null
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
  const acceptGps = useCallback(() => {
    const active = activeInteractive.current
    const selected = current.current
    if (!active || active.operation !== epoch.current || !selected || selected.selection !== 'gps') return
    setGpsState({ status: 'ready', lowAccuracy: isLowAccuracy(selected.accuracy) })
    finishInteractive(active.operation)
  }, [finishInteractive])
  const invalidate = useCallback(() => {
    epoch.current += 1
    started.current = true
    activeInteractive.current = null
    setGpsState({ status: 'idle' })
    setNameLookupState('idle')
  }, [])
  return { place, source, notice, gpsState, nameLookupState, restore, locate, acceptGps, selectOfficial, selectCity, selectRecent, changeTimeZone, invalidate }
}
