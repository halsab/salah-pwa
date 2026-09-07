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
import { loadLocalGeography } from './data/localGeography'
import type { CoverageGeometry } from './domain/localGeography'
import { officialLocationForPlace, type Place } from './domain/place'
import { usePlaceSelection } from './features/location/usePlaceSelection'
import type { DataFailure, GeolocationFailure, StorageFailure } from './domain/errors'
import {
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
import type { DatasetMeta } from './storage/database'
import { AppHeader } from './ui/AppHeader'
import { ShareIcon } from './ui/Icons'

export interface AppServices {
  initialize: (onCached?: (state: PrayerRepositoryState) => void) => Promise<Result<PrayerRepositoryState, DataFailure | StorageFailure>>
  cities: CityCatalogService
  getDays: (
    locationId: string,
    dates: readonly string[],
    datasetRevision: string,
  ) => Promise<Result<(PrayerDay | undefined)[], StorageFailure | DataFailure>>
  saveOfficialLocation: (
    locationId: string,
    source: LocationSelectionSource,
    place?: Place,
    isCurrent?: () => boolean,
  ) => Promise<Result<void, StorageFailure>>
  saveCalculatedLocation: (
    coordinates: SavedCoordinates,
    source: LocationSelectionSource,
    isCurrent?: () => boolean,
  ) => Promise<Result<void, DataFailure | StorageFailure>>
  saveCalculationSettings: (
    settings: CalculationSettings,
  ) => Promise<Result<void, StorageFailure>>
  loadGeography: () => Promise<CoverageGeometry | null>
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
  loadGeography: loadLocalGeography,
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
  const [calculationSettings, setCalculationSettings] = useState<CalculationSettings>(DEFAULT_CALCULATION_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [locationDialogOpen, setLocationDialogOpen] = useState(false)
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [settingsFocusMethodology, setSettingsFocusMethodology] = useState(false)
  const [methodologyDialogOpen, setMethodologyDialogOpen] = useState(false)
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const locationButtonRef = useRef<HTMLButtonElement>(null)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  const footerMethodologyButtonRef = useRef<HTMLButtonElement>(null)
  const settingsMethodologyButtonRef = useRef<HTMLButtonElement>(null)
  const methodologyReturnTarget = useRef<'footer' | 'settings'>('footer')
  const shareButtonRef = useRef<HTMLButtonElement>(null)

  const closeLocationDialog = useCallback(() => {
    setLocationDialogOpen(false)
    requestAnimationFrame(() => locationButtonRef.current?.focus())
  }, [])
  const onPlaceChosen = useCallback(() => { closeLocationDialog(); pulseHaptic() }, [closeLocationDialog])
  const locations = useMemo(() => meta?.locations ?? [], [meta])
  const { place, notice: locationNotice, restore, locate: locateAutomatically,
    selectOfficial: selectOfficialLocation, selectCity: selectPresetCity, changeTimeZone } = usePlaceSelection(services, locations, onPlaceChosen)
  const officialLocation = place ? officialLocationForPlace(place, locations) : null
  const locationMode = officialLocation ? 'official' : 'calculated'
  const locationId = officialLocation?.id ?? 'kazan'
  const calculatedLocation = place

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setLoading(true)
      setError(null)
    })
    const acceptState = (state: PrayerRepositoryState) => {
      if (!active) return
      setMeta(state.meta)
      restore(state.locationChoice, state.meta.locations)
      setCalculationSettings(state.calculationSettings)
      setLoading(false)
    }
    void services.initialize(acceptState).then((result) => {
      if (!active) return
      if (!result.ok) {
        setError('Не удалось открыть расписание. Проверьте соединение и попробуйте ещё раз.')
        return
      }
      acceptState(result.value)
    }).catch(() => active && setError('Не удалось открыть расписание. Проверьте соединение и попробуйте ещё раз.'))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [retryCount, services, restore])

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
    getDays: async (nextLocationId: string, dates: readonly string[], datasetRevision: string) => {
      const result = await services.getDays(nextLocationId, dates, datasetRevision)
      if (!result.ok) throw new Error(result.error.reason)
      return result.value
    },
  }), [services])
  const {
    schedule,
    schedules,
    contextKey,
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
  const calculatedLocationLabel = calculatedLocation?.name ?? 'Моё местоположение'
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

          {officialLocation && place?.selection !== 'official' ? (
            <p className="location-schedule-note">Таблица ДУМ РТ: {officialLocation.name} — ближайший опубликованный пункт. Время и дата таблицы: Europe/Moscow.</p>
          ) : null}
          {locationNotice ? <p role="status" className="location-schedule-note">{locationNotice}</p> : null}
          <ScheduleContent
            schedule={schedule}
            key={contextKey}
            schedules={schedules}
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
        place={place}
        officialLocation={officialLocation}
        onTimeZoneChange={changeTimeZone}
        open={locationDialogOpen}
        onClose={closeLocationDialog}
        onSelectOfficial={selectOfficialLocation}
        onSelectCity={selectPresetCity}
        onLocate={locateAutomatically}
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
