import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import type { CityCatalogService } from './data/cityCatalog'
import { cityCatalogService } from './data/cityCatalogClient'
import { prayerRepository, type PrayerRepositoryState } from './data/prayerRepository'
import { resolvePlaceName, type ResolvedPlace } from './data/reverseGeocoder'
import { formatCityLabel, type City } from './domain/cities'
import type { DataFailure, GeolocationFailure, StorageFailure } from './domain/errors'
import { findNearestLocation, isConfirmedTatarstan } from './domain/location'
import {
  shouldStartAutomaticLocation,
  type LocationSelectionSource,
} from './domain/locationSelection'
import {
  DEFAULT_CALCULATION_SETTINGS,
  getCalculationProfileCapability,
  type CalculationProfileCapability,
  type CalculationProfileId,
  type CalculationSettings,
} from './domain/prayerCalculation'
import {
  DUM_RT_TIME_ZONE,
  getDeviceTimeZone,
  getUtcOffset,
} from './domain/locationTime'
import type { PrayerDay, SavedCoordinates } from './domain/types'
import type { Result } from './domain/result'
import { LocationDialog } from './features/location/LocationDialog'
import { useCityCatalog } from './features/location/useCityCatalog'
import { MethodologyDialog } from './features/methodology/MethodologyDialog'
import { ScheduleContent } from './features/schedule/ScheduleContent'
import { usePrayerSchedules } from './features/schedule/usePrayerSchedules'
import { useScheduleDate } from './features/schedule/useScheduleDate'
import { SettingsDialog } from './features/settings/SettingsDialog'
import { ShareDialog } from './features/share/ShareDialog'
import {
  getCurrentPosition,
  getGeolocationPermission,
  pulseHaptic,
  type Coordinates,
  type GeolocationPermission,
  type PositionAccuracy,
} from './platform/browser'
import type { DatasetMeta, LocationMode } from './storage/database'
import { AppHeader } from './ui/AppHeader'
import { ShareIcon } from './ui/Icons'

export interface AppServices {
  initialize: () => Promise<Result<PrayerRepositoryState, DataFailure | StorageFailure>>
  cities: CityCatalogService
  getDay: (
    locationId: string,
    date: string,
  ) => Promise<Result<PrayerDay | undefined, StorageFailure>>
  saveOfficialLocation: (
    locationId: string,
    source: LocationSelectionSource,
  ) => Promise<Result<void, StorageFailure>>
  saveCalculatedLocation: (
    coordinates: SavedCoordinates,
    source: LocationSelectionSource,
  ) => Promise<Result<void, DataFailure | StorageFailure>>
  saveCalculationSettings: (
    settings: CalculationSettings,
  ) => Promise<Result<void, StorageFailure>>
  resolvePlaceName: (
    coordinates: SavedCoordinates,
  ) => Promise<Result<ResolvedPlace, DataFailure>>
  getPermission: () => Promise<GeolocationPermission>
  getPosition: (
    accuracy: PositionAccuracy,
  ) => Promise<Result<Coordinates, GeolocationFailure>>
  getDeviceTimeZone: () => string
  getCalculationProfileCapability: (
    profile: CalculationProfileId,
  ) => CalculationProfileCapability
  now: () => Date
}

const defaultServices: AppServices = {
  ...prayerRepository,
  cities: cityCatalogService,
  resolvePlaceName,
  getPermission: getGeolocationPermission,
  getPosition: getCurrentPosition,
  getDeviceTimeZone,
  getCalculationProfileCapability,
  now: () => new Date(),
}

function canonicalTimeZone(timeZone: string): string {
  return new Intl.DateTimeFormat('en', { timeZone }).resolvedOptions().timeZone
}

function consumeBackground(operation: Promise<unknown>): void {
  void operation.catch(() => undefined)
}

function locationErrorMessage(error: GeolocationFailure): string {
  if (error.reason === 'denied') return 'Доступ к геопозиции запрещён'
  if (error.reason === 'unsupported') return 'Геопозиция не поддерживается'
  if (error.reason === 'timeout') return 'Не удалось определить местоположение вовремя'
  return 'Не удалось определить местоположение'
}

function AppVersion({ version }: { version: string | undefined }) {
  return version ? <small className="app-version">{version}</small> : null
}

function LoadingScreen({ version }: { version: string | undefined }) {
  return (
    <main className="page-shell loading-page">
      <section className="app-frame" aria-busy="true">
        <h1 className="brand">Salah</h1>
        <div className="loading-mark" aria-hidden="true" />
        <p>Открываем расписание…</p>
      </section>
      <AppVersion version={version} />
    </main>
  )
}

export function App({
  services = defaultServices,
  version = (import.meta.env.VITE_APP_VERSION
    || import.meta.env.VITE_APP_PACKAGE_VERSION) as string | undefined,
}: {
  services?: AppServices
  version?: string
}) {
  const [meta, setMeta] = useState<DatasetMeta | null>(null)
  const [locationId, setLocationId] = useState('kazan')
  const [locationMode, setLocationMode] = useState<LocationMode>('official')
  const [calculatedLocation, setCalculatedLocation] = useState<SavedCoordinates | null>(null)
  const [locationSelectionSource, setLocationSelectionSource] = useState<LocationSelectionSource | null>(null)
  const [calculationSettings, setCalculationSettings] = useState<CalculationSettings>(DEFAULT_CALCULATION_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [locationDialogOpen, setLocationDialogOpen] = useState(false)
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [settingsFocusMethodology, setSettingsFocusMethodology] = useState(false)
  const [methodologyDialogOpen, setMethodologyDialogOpen] = useState(false)
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const automaticLocationAttempted = useRef(false)
  const locationOperationEpoch = useRef(0)
  const locationButtonRef = useRef<HTMLButtonElement>(null)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  const footerMethodologyButtonRef = useRef<HTMLButtonElement>(null)
  const settingsMethodologyButtonRef = useRef<HTMLButtonElement>(null)
  const methodologyReturnTarget = useRef<'footer' | 'settings'>('footer')
  const shareButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setLoading(true)
      setError(null)
    })
    void services.initialize().then((result) => {
      if (!active) return
      if (!result.ok) {
        setError('Не удалось открыть расписание. Проверьте соединение и попробуйте ещё раз.')
        return
      }
      const state = result.value
      setMeta(state.meta)
      setLocationSelectionSource(state.locationChoice.source)
      if (state.locationChoice.mode === 'official') {
        setLocationId(state.locationChoice.locationId)
        setLocationMode('official')
        setCalculatedLocation(null)
      } else {
        setLocationMode('calculated')
        setCalculatedLocation(state.locationChoice.coordinates)
      }
      setCalculationSettings(state.calculationSettings)
    }).catch(() => active && setError('Не удалось открыть расписание. Проверьте соединение и попробуйте ещё раз.'))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [retryCount, services])

  const { cityCatalog, cityCatalogStatus, loadCities } = useCityCatalog(services)
  const deviceTimeZone = services.getDeviceTimeZone()
  const selectedTimeZone = locationMode === 'official'
    ? DUM_RT_TIME_ZONE
    : calculatedLocation?.timeZone ?? deviceTimeZone
  const {
    selectedDate,
    currentTime,
    today,
    changeDate,
    onDateInput,
    showDatePicker,
  } = useScheduleDate(services, selectedTimeZone)
  const scheduleServices = useMemo(() => ({
    getDay: async (nextLocationId: string, date: string) => {
      const result = await services.getDay(nextLocationId, date)
      if (!result.ok) throw new Error(result.error.reason)
      return result.value
    },
  }), [services])
  const {
    schedule,
    previousSchedule,
    tomorrow,
    scheduleLoading,
    scheduleError,
    retrySchedule,
  } = usePrayerSchedules({
    services: scheduleServices,
    meta,
    locationId,
    locationMode,
    calculatedLocation,
    calculationSettings,
    selectedDate,
    timeZone: selectedTimeZone,
  })

  const openLocationDialog = useCallback(() => {
    setLocationDialogOpen(true)
  }, [])

  const closeLocationDialog = useCallback(() => {
    setLocationDialogOpen(false)
    requestAnimationFrame(() => locationButtonRef.current?.focus())
  }, [])
  const closeSettingsDialog = useCallback(() => {
    setSettingsDialogOpen(false)
    setSettingsFocusMethodology(false)
    requestAnimationFrame(() => settingsButtonRef.current?.focus())
  }, [])
  const openSettingsDialog = useCallback(() => {
    setSettingsFocusMethodology(false)
    setSettingsDialogOpen(true)
  }, [])
  const openMethodologyDialog = useCallback((returnTarget: 'footer' | 'settings') => {
    methodologyReturnTarget.current = returnTarget
    if (returnTarget === 'settings') setSettingsDialogOpen(false)
    setMethodologyDialogOpen(true)
  }, [])
  const closeMethodologyDialog = useCallback(() => {
    setMethodologyDialogOpen(false)
    if (methodologyReturnTarget.current === 'settings') {
      setSettingsFocusMethodology(true)
      setSettingsDialogOpen(true)
      return
    }
    requestAnimationFrame(() => footerMethodologyButtonRef.current?.focus())
  }, [])
  const closeShareDialog = useCallback(() => {
    setShareDialogOpen(false)
    requestAnimationFrame(() => shareButtonRef.current?.focus())
  }, [])

  const applyOfficialLocation = useCallback((
    nextLocationId: string,
    source: LocationSelectionSource,
    interactive: boolean,
    operationEpoch: number,
  ) => {
    if (operationEpoch !== locationOperationEpoch.current) return
    setLocationId(nextLocationId)
    setLocationMode('official')
    setCalculatedLocation(null)
    setLocationSelectionSource(source)
    if (interactive) {
      closeLocationDialog()
      pulseHaptic()
    }
    consumeBackground(services.saveOfficialLocation(nextLocationId, source))
  }, [closeLocationDialog, services])

  const applyCalculatedLocation = useCallback((
    coordinates: SavedCoordinates,
    source: LocationSelectionSource,
    interactive: boolean,
    operationEpoch: number,
  ) => {
    if (operationEpoch !== locationOperationEpoch.current) return
    setCalculatedLocation(coordinates)
    setLocationMode('calculated')
    setLocationSelectionSource(source)
    if (interactive) {
      closeLocationDialog()
      pulseHaptic()
    }
    consumeBackground(services.saveCalculatedLocation(coordinates, source))
  }, [closeLocationDialog, services])

  const selectOfficialLocation = useCallback((nextLocationId: string) => {
    const operationEpoch = ++locationOperationEpoch.current
    applyOfficialLocation(nextLocationId, 'manual', true, operationEpoch)
  }, [applyOfficialLocation])

  const locateAutomatically = useCallback(async (
    interactive = true,
    existingOperationEpoch?: number,
  ) => {
    if (!meta) return
    const operationEpoch = existingOperationEpoch ?? ++locationOperationEpoch.current
    if (interactive) automaticLocationAttempted.current = true
    let coarseResult: Awaited<ReturnType<AppServices['getPosition']>>
    try {
      coarseResult = await services.getPosition('coarse')
    } catch (error) {
      if (operationEpoch !== locationOperationEpoch.current) return
      throw error
    }
    if (operationEpoch !== locationOperationEpoch.current) return
    if (!coarseResult.ok) throw new Error(locationErrorMessage(coarseResult.error))

    let bestPosition = coarseResult.value
    let preciseResult: Awaited<ReturnType<AppServices['getPosition']>>
    try {
      preciseResult = await services.getPosition('precise')
    } catch (error) {
      if (operationEpoch !== locationOperationEpoch.current) return
      throw error
    }
    if (operationEpoch !== locationOperationEpoch.current) return
    if (preciseResult.ok) bestPosition = preciseResult.value

    let resolvedPlace: ResolvedPlace | null = null
    try {
      const resolvedResult = await services.resolvePlaceName({
        ...bestPosition,
        timeZone: services.getDeviceTimeZone(),
        source: 'gps',
      })
      if (operationEpoch !== locationOperationEpoch.current) return
      if (resolvedResult.ok) resolvedPlace = resolvedResult.value
    } catch {
      if (operationEpoch !== locationOperationEpoch.current) return
      // Координат достаточно для расчёта, даже если сетевое уточнение недоступно.
    }

    if (
      resolvedPlace
      && isConfirmedTatarstan(resolvedPlace.regionEvidence)
    ) {
      const officialLocation = findNearestLocation(
        bestPosition.latitude,
        bestPosition.longitude,
        meta.locations,
      )
      if (officialLocation) {
        applyOfficialLocation(
          officialLocation.id,
          'automatic',
          interactive,
          operationEpoch,
        )
        return
      }
    }

    applyCalculatedLocation({
      ...bestPosition,
      timeZone: services.getDeviceTimeZone(),
      source: 'gps',
      ...(resolvedPlace?.name
        ? { name: resolvedPlace.name, nameSource: 'nominatim' as const }
        : {}),
    }, 'automatic', interactive, operationEpoch)
  }, [applyCalculatedLocation, applyOfficialLocation, meta, services])

  const selectPresetCity = useCallback((city: City) => {
    const operationEpoch = ++locationOperationEpoch.current
    if (!meta) return
    if (isConfirmedTatarstan({
      source: 'geonames',
      countryCode: city.countryCode,
      admin1Code: city.admin1Code,
    })) {
      const officialLocation = findNearestLocation(
        city.latitude,
        city.longitude,
        meta.locations,
      )
      if (officialLocation) {
        applyOfficialLocation(officialLocation.id, 'manual', true, operationEpoch)
        return
      }
    }

    applyCalculatedLocation({
      latitude: city.latitude,
      longitude: city.longitude,
      timeZone: city.timeZone,
      accuracy: null,
      timestamp: services.now().getTime(),
      name: formatCityLabel(city),
      cityId: city.id,
      nameSource: 'geonames',
      source: 'preset',
    }, 'manual', true, operationEpoch)
  }, [applyCalculatedLocation, applyOfficialLocation, meta, services])

  const reverseCalculatedLocation = useCallback(async () => {
    if (!calculatedLocation) return
    const operationEpoch = ++locationOperationEpoch.current
    let result: Awaited<ReturnType<AppServices['resolvePlaceName']>>
    try {
      result = await services.resolvePlaceName(calculatedLocation)
    } catch (error) {
      if (operationEpoch !== locationOperationEpoch.current) return
      throw error
    }
    if (operationEpoch !== locationOperationEpoch.current) return
    if (!result.ok || !result.value.name) {
      throw new Error('Не удалось уточнить название местоположения')
    }
    const updatedLocation: SavedCoordinates = {
      ...calculatedLocation,
      name: result.value.name,
      nameSource: 'nominatim',
    }
    setCalculatedLocation(updatedLocation)
    consumeBackground(services.saveCalculatedLocation(
      updatedLocation,
      locationSelectionSource ?? 'manual',
    ))
  }, [calculatedLocation, locationSelectionSource, services])

  useEffect(() => {
    if (
      !meta
      || automaticLocationAttempted.current
      || !shouldStartAutomaticLocation({ source: locationSelectionSource })
    ) return
    automaticLocationAttempted.current = true
    const operationEpoch = ++locationOperationEpoch.current
    void services.getPermission().then((permission) => {
      if (operationEpoch !== locationOperationEpoch.current) return
      if (permission === 'granted') {
        void locateAutomatically(false, operationEpoch).catch(() => undefined)
      }
    }).catch(() => undefined)
  }, [locateAutomatically, locationSelectionSource, meta, services])

  if (loading) return <LoadingScreen version={version} />

  if (error || !meta) {
    return (
      <main className="page-shell error-page">
        <section className="app-frame error-frame">
          <h1 className="brand">Salah</h1>
          <div className="error-symbol" aria-hidden="true">!</div>
          <p role="alert">{error ?? 'Не удалось открыть расписание.'}</p>
          <button className="primary-button" type="button" onClick={() => setRetryCount((count) => count + 1)}>
            Попробовать снова
          </button>
        </section>
        <AppVersion version={version} />
      </main>
    )
  }

  const officialMode = locationMode === 'official'
  const minDate = officialMode ? `${meta.source.years[0]}-01-01` : undefined
  const maxDate = officialMode ? `${meta.source.years.at(-1)}-12-31` : undefined
  const selectedLocation = meta.locations.find(({ id }) => id === locationId)
  const updateCalculationSettings = (settings: CalculationSettings) => {
    setCalculationSettings(settings)
    consumeBackground(services.saveCalculationSettings(settings))
  }
  const calculatedLocationLabel = calculatedLocation?.name ?? 'Текущее местоположение'
  const timeZoneOffset = canonicalTimeZone(selectedTimeZone) === canonicalTimeZone(deviceTimeZone)
    ? null
    : getUtcOffset(currentTime, selectedTimeZone)
  const dialogOpen = locationDialogOpen
    || settingsDialogOpen
    || methodologyDialogOpen
    || shareDialogOpen

  return (
    <main className="page-shell">
      <div
        className="app-background"
        inert={dialogOpen || undefined}
        aria-hidden={dialogOpen || undefined}
      >
        <section className="app-frame">
          <AppHeader
            locationButtonRef={locationButtonRef}
            settingsButtonRef={settingsButtonRef}
            officialMode={officialMode}
            selectedLocation={selectedLocation}
            calculatedLocationLabel={calculatedLocationLabel}
            timeZoneOffset={timeZoneOffset}
            selectedDate={selectedDate}
            today={today}
            minDate={minDate}
            maxDate={maxDate}
            onOpenLocation={openLocationDialog}
            onOpenSettings={openSettingsDialog}
            onChangeDate={changeDate}
            onDateInput={onDateInput}
            onShowDatePicker={showDatePicker}
          />

          <ScheduleContent
            schedule={schedule}
            previousSchedule={previousSchedule}
            tomorrow={tomorrow}
            scheduleLoading={scheduleLoading}
            scheduleError={scheduleError}
            selectedDate={selectedDate}
            today={today}
            currentTime={currentTime}
            now={services.now}
            officialMode={officialMode}
            calculationSettings={calculationSettings}
            officialScheduleUrl={meta.source.url}
            methodologyButtonRef={footerMethodologyButtonRef}
            onChangeDate={changeDate}
            onRetrySchedule={retrySchedule}
            onOpenMethodology={() => openMethodologyDialog('footer')}
          />
        </section>

        <button
          ref={shareButtonRef}
          className="share-button"
          type="button"
          onClick={() => setShareDialogOpen(true)}
        >
          <ShareIcon />
          <span>Поделиться</span>
        </button>
        <AppVersion version={version} />
      </div>

      <LocationDialog
        locations={meta.locations}
        cityCatalog={cityCatalog}
        cityCatalogStatus={cityCatalogStatus}
        selectedOfficialId={officialMode ? locationId : null}
        selectedCityId={officialMode ? null : calculatedLocation?.cityId ?? null}
        calculatedLocation={officialMode ? null : calculatedLocation}
        open={locationDialogOpen}
        onClose={closeLocationDialog}
        onSelectOfficial={selectOfficialLocation}
        onSelectCity={selectPresetCity}
        onLocate={locateAutomatically}
        onReverse={reverseCalculatedLocation}
        onLoadCities={loadCities}
        onSearchCities={services.cities.search}
      />
      <SettingsDialog
        open={settingsDialogOpen}
        officialMode={officialMode}
        settings={calculationSettings}
        focusMethodologyOnOpen={settingsFocusMethodology}
        methodologyTriggerRef={settingsMethodologyButtonRef}
        getCalculationProfileCapability={services.getCalculationProfileCapability}
        onClose={closeSettingsDialog}
        onChange={updateCalculationSettings}
        onOpenMethodology={() => openMethodologyDialog('settings')}
      />
      <MethodologyDialog
        open={methodologyDialogOpen}
        officialScheduleUrl={meta.source.url}
        onClose={closeMethodologyDialog}
      />
      <ShareDialog open={shareDialogOpen} onClose={closeShareDialog} />
    </main>
  )
}
