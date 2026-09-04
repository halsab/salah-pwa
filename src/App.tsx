import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import type { CityCatalogService } from './data/cityCatalog'
import { cityCatalogService } from './data/cityCatalogClient'
import { prayerRepository } from './data/prayerRepository'
import { resolvePlaceName } from './data/reverseGeocoder'
import { formatCityLabel, type City } from './domain/cities'
import { findNearestLocation } from './domain/location'
import {
  DEFAULT_CALCULATION_SETTINGS,
  type CalculationSettings,
} from './domain/prayerCalculation'
import type { PrayerDay, SavedCoordinates } from './domain/types'
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

interface InitializedAppState {
  meta: DatasetMeta
  locationId: string
  locationMode: LocationMode
  calculatedLocation: SavedCoordinates | null
  calculationSettings: CalculationSettings
}

export interface AppServices {
  initialize: () => Promise<InitializedAppState>
  cities: CityCatalogService
  getDay: (locationId: string, date: string) => Promise<PrayerDay | undefined>
  saveOfficialLocation: (locationId: string) => Promise<void>
  saveCalculatedLocation: (coordinates: SavedCoordinates) => Promise<void>
  saveCalculationSettings: (settings: CalculationSettings) => Promise<void>
  resolvePlaceName: (coordinates: SavedCoordinates) => Promise<string>
  getPermission: () => Promise<GeolocationPermission>
  getPosition: (accuracy: PositionAccuracy) => Promise<Coordinates>
  now: () => Date
}

const defaultServices: AppServices = {
  ...prayerRepository,
  cities: cityCatalogService,
  resolvePlaceName,
  getPermission: getGeolocationPermission,
  getPosition: getCurrentPosition,
  now: () => new Date(),
}

const MAX_AUTOMATIC_DISTANCE_KM = 80
const MAX_OFFLINE_CITY_DISTANCE_KM = 30

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
  version = import.meta.env.VITE_APP_VERSION,
}: {
  services?: AppServices
  version?: string
}) {
  const [meta, setMeta] = useState<DatasetMeta | null>(null)
  const [locationId, setLocationId] = useState('kazan')
  const [locationMode, setLocationMode] = useState<LocationMode>('official')
  const [calculatedLocation, setCalculatedLocation] = useState<SavedCoordinates | null>(null)
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
  const locationButtonRef = useRef<HTMLButtonElement>(null)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  const footerMethodologyButtonRef = useRef<HTMLButtonElement>(null)
  const settingsMethodologyButtonRef = useRef<HTMLButtonElement>(null)
  const methodologyReturnTarget = useRef<'footer' | 'settings'>('footer')
  const shareButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    void services.initialize().then((state) => {
      if (!active) return
      setMeta(state.meta)
      setLocationId(state.locationId)
      setLocationMode(state.locationMode)
      setCalculatedLocation(state.calculatedLocation)
      setCalculationSettings(state.calculationSettings)
    }).catch(() => active && setError('Не удалось открыть расписание. Проверьте соединение и попробуйте ещё раз.'))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [retryCount, services])

  const { cityCatalog, cityCatalogStatus, loadCities } = useCityCatalog(services)
  const {
    selectedDate,
    currentTime,
    today,
    changeDate,
    onDateInput,
    showDatePicker,
  } = useScheduleDate(services)
  const {
    schedule,
    previousSchedule,
    tomorrow,
    scheduleLoading,
    scheduleError,
    retrySchedule,
  } = usePrayerSchedules({
    services,
    meta,
    locationId,
    locationMode,
    calculatedLocation,
    calculationSettings,
    selectedDate,
  })

  const openLocationDialog = useCallback(() => {
    setLocationDialogOpen(true)
    loadCities()
  }, [loadCities])

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

  const selectOfficialLocation = useCallback((nextLocationId: string) => {
    setLocationId(nextLocationId)
    setLocationMode('official')
    closeLocationDialog()
    pulseHaptic()
    void services.saveOfficialLocation(nextLocationId)
  }, [closeLocationDialog, services])

  const selectCalculatedLocation = useCallback((coordinates: SavedCoordinates) => {
    setCalculatedLocation(coordinates)
    setLocationMode('calculated')
    closeLocationDialog()
    pulseHaptic()
    void services.saveCalculatedLocation(coordinates)
  }, [closeLocationDialog, services])

  const locateAutomatically = useCallback(async () => {
    if (!meta) return
    const coarse = await services.getPosition('coarse')
    const coarseOfficial = findNearestLocation(
      coarse.latitude,
      coarse.longitude,
      meta.locations,
      MAX_AUTOMATIC_DISTANCE_KM,
    )
    if (coarseOfficial) {
      selectOfficialLocation(coarseOfficial.id)
      return
    }

    let bestPosition = coarse
    try {
      const precise = await services.getPosition('precise')
      bestPosition = precise
      const preciseOfficial = findNearestLocation(
        precise.latitude,
        precise.longitude,
        meta.locations,
        MAX_AUTOMATIC_DISTANCE_KM,
      )
      if (preciseOfficial) {
        selectOfficialLocation(preciseOfficial.id)
        return
      }
    } catch {
      // Грубых координат достаточно для резервного автономного расчёта.
    }
    let nearestCity: City | null = null
    if (cityCatalog) {
      try {
        nearestCity = await services.cities.findNearest(
          bestPosition.latitude,
          bestPosition.longitude,
          MAX_OFFLINE_CITY_DISTANCE_KM,
        )
      } catch {
        // Координат достаточно для расчёта; название города необязательно.
      }
    }
    selectCalculatedLocation({
      ...bestPosition,
      source: 'gps',
      ...(nearestCity
        ? {
            name: formatCityLabel(nearestCity),
            cityId: nearestCity.id,
            nameSource: 'geonames' as const,
          }
        : {}),
    })
  }, [cityCatalog, meta, selectCalculatedLocation, selectOfficialLocation, services])

  const selectPresetCity = useCallback((city: City) => {
    if (!meta) return
    const officialLocation = findNearestLocation(
      city.latitude,
      city.longitude,
      meta.locations,
      MAX_AUTOMATIC_DISTANCE_KM,
    )
    if (officialLocation) {
      selectOfficialLocation(officialLocation.id)
      return
    }

    selectCalculatedLocation({
      latitude: city.latitude,
      longitude: city.longitude,
      accuracy: null,
      timestamp: services.now().getTime(),
      name: formatCityLabel(city),
      cityId: city.id,
      nameSource: 'geonames',
      source: 'preset',
    })
  }, [meta, selectCalculatedLocation, selectOfficialLocation, services])

  const reverseCalculatedLocation = useCallback(async () => {
    if (!calculatedLocation) return
    const name = await services.resolvePlaceName(calculatedLocation)
    const updatedLocation: SavedCoordinates = {
      ...calculatedLocation,
      name,
      nameSource: 'nominatim',
    }
    setCalculatedLocation(updatedLocation)
    await services.saveCalculatedLocation(updatedLocation)
  }, [calculatedLocation, services])

  useEffect(() => {
    if (!meta || automaticLocationAttempted.current) return
    automaticLocationAttempted.current = true
    void services.getPermission().then((permission) => {
      if (permission === 'granted') void locateAutomatically().catch(() => undefined)
    })
  }, [locateAutomatically, meta, services])

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
    void services.saveCalculationSettings(settings)
  }
  const calculatedLocationLabel = calculatedLocation?.name ?? 'Текущее местоположение'

  return (
    <main className="page-shell">
      <section className="app-frame">
        <AppHeader
          locationButtonRef={locationButtonRef}
          settingsButtonRef={settingsButtonRef}
          officialMode={officialMode}
          selectedLocation={selectedLocation}
          calculatedLocationLabel={calculatedLocationLabel}
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
