import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import type { CityCatalogService } from './data/cityCatalog'
import { cityCatalogService } from './data/cityCatalogClient'
import { prayerRepository, type PrayerRepositoryState, type PrayerRepositorySnapshot } from './data/prayerRepository'
import { loadLocalGeography } from './data/localGeography'
import type { CoverageGeometry } from './domain/localGeography'
import { PRAYER_PROVIDERS, DEFAULT_OFFICIAL_LOCATIONS, officialDatasets } from './data/prayerProviders'
import { resolvePrayerTimeSource } from './domain/prayerSource'
import { automaticPreferences, manualCalculation, type SourcePreferences } from './domain/sourcePreferences'
import { effectiveCalculationSettings, selectionFromSettings } from './domain/calculationSettings'
import { useSettingsPersistence } from './features/settings/useSettingsPersistence'
import { usePlaceSelection } from './features/location/usePlaceSelection'
import type { GeolocationFailure } from './domain/errors'
import {
  DEFAULT_CALCULATION_SETTINGS,
  CALCULATION_PROFILES,
  getCalculationProfileCapability,
  type CalculationProfileCapability,
  type CalculationProfileId,
  type CalculationSettings,
} from './domain/prayerCalculation'
import {
  getDeviceTimeZone,
  getUtcOffset,
} from './domain/locationTime'
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
import type { LocationChoice } from './storage/database'
import { AppHeader } from './ui/AppHeader'
import { ShareIcon } from './ui/Icons'

export interface AppServices extends Pick<typeof prayerRepository, 'initialize' | 'refresh' | 'subscribe' | 'getDays' | 'saveSettings' | 'invalidateAndDrain'> {
  cities: CityCatalogService
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
  const [repositoryState, setRepositoryState] = useState<PrayerRepositorySnapshot>({ meta: null, dataState: 'not-loaded', update: { status: 'idle' }, checkedAt: null })
  const meta = repositoryState.meta
  const [preferences, setPreferences] = useState<SourcePreferences>(automaticPreferences)
  const persistence = useSettingsPersistence(services.saveSettings)
  const saveSettings = persistence.save
  const persistPlace = useCallback((choice: LocationChoice) => saveSettings({ locationChoice: choice }), [saveSettings])
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
  const locations = useMemo(() => meta?.locations ?? DEFAULT_OFFICIAL_LOCATIONS, [meta])
  const { place, notice: locationNotice, restore, locate: locateAutomatically,
    selectOfficial: selectOfficialLocation, selectCity: selectPresetCity, changeTimeZone } = usePlaceSelection(services, locations, onPlaceChosen, persistPlace)
  const datasets = useMemo(() => officialDatasets(meta, repositoryState.dataState), [meta, repositoryState.dataState])
  const capabilities = useMemo(() => CALCULATION_PROFILES.filter(p => services.getCalculationProfileCapability(p.id).supported).map(p => p.id), [services])

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setLoading(true)
      setError(null)
    })
    const acceptState = (state: PrayerRepositoryState) => {
      if (!active) return
      setRepositoryState(state)
      restore(state.locationChoice, state.meta?.locations ?? DEFAULT_OFFICIAL_LOCATIONS)
      setPreferences(state.preferences)
      setLoading(false)
    }
    const unsubscribe = services.subscribe(snapshot => { if (active) setRepositoryState(snapshot) })
    const refresh = () => { void services.refresh() }
    void services.initialize().then((result) => {
      if (!active) return
      if (!result.ok) {
        setError('Не удалось открыть расписание. Проверьте соединение и попробуйте ещё раз.')
        return
      }
      acceptState(result.value)
      refresh()
    }).catch(() => active && setError('Не удалось открыть расписание. Проверьте соединение и попробуйте ещё раз.'))
      .finally(() => active && setLoading(false))
    window.addEventListener('online', refresh)
    window.addEventListener('pageshow', refresh)
    return () => { active = false; unsubscribe(); window.removeEventListener('online', refresh); window.removeEventListener('pageshow', refresh); void services.invalidateAndDrain() }
  }, [retryCount, services, restore])

  const { cityCatalog, cityCatalogStatus, loadCities } = useCityCatalog(services)
  const deviceTimeZone = services.getDeviceTimeZone()
  const todayResolution = place ? resolvePrayerTimeSource(place, services.now(), preferences, datasets, capabilities) : null
  const calendarTimeZone = todayResolution?.timeZone ?? place?.timeZone ?? deviceTimeZone
  const {
    selectedDate,
    currentTime,
    today,
    changeDate,
    onDateInput,
    showDatePicker,
  } = useScheduleDate(services, calendarTimeZone)
  const resolution = place ? resolvePrayerTimeSource(place, selectedDate, preferences, datasets, capabilities) : null
  const officialMode = resolution?.kind === 'official'
  const officialProvider = resolution?.kind === 'official' ? PRAYER_PROVIDERS.find(provider => provider.id === resolution.provider) : undefined
  const locationId = resolution?.kind === 'official' ? resolution.locationId : null
  const officialLocation = officialMode ? locations.find(location => location.id === locationId) ?? null : null
  const selectedTimeZone = resolution?.timeZone ?? calendarTimeZone
  const calculationSettings = resolution?.kind === 'calculated' ? resolution.settings
    : preferences.calculationDraft ? effectiveCalculationSettings(preferences.calculationDraft) : DEFAULT_CALCULATION_SETTINGS
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
    location: place,
    resolution,
    mode: preferences.mode,
    selectedDate,
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

  if (error) {
    return (
      <main className="page-shell error-page">
        <section className="app-frame error-frame">
          <h1 className="brand">Salah</h1>
          <div className="error-symbol" aria-hidden="true">!</div>
          <p role="alert">{error}</p>
          <button className="primary-button" type="button" onClick={() => setRetryCount((count) => count + 1)}>
            Попробовать снова
          </button>
        </section>
        <AppVersion version={version} />
      </main>
    )
  }

  const selectedLocation = officialLocation ?? undefined
  const updatePreferences = (next: SourcePreferences) => {
    setPreferences(next)
    persistence.save({ sourcePreferences: next })
  }
  const updateCalculationSettings = (settings: CalculationSettings) => {
    updatePreferences(manualCalculation(selectionFromSettings(settings)))
  }
  const calculatedLocationLabel = place?.name ?? 'Моё местоположение'
  const timeZoneOffset = canonicalTimeZone(selectedTimeZone) === canonicalTimeZone(deviceTimeZone)
    ? null
    : getUtcOffset(currentTime, selectedTimeZone)
  const dialogOpen = locationDialogOpen
    || settingsDialogOpen
    || methodologyDialogOpen
    || shareDialogOpen

  const persistenceNotice = persistence.status === 'failed' ? (
        <div className="persistence-notice" role="status">
          <span>Изменение действует сейчас, но сохранить его не удалось</span>
          <button type="button" className="primary-button" onClick={persistence.retry}>Повторить</button>
        </div>
      ) : null

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
            minDate={undefined}
            maxDate={undefined}
            onOpenLocation={openLocationDialog}
            onOpenSettings={openSettingsDialog}
            onChangeDate={changeDate}
            onDateInput={onDateInput}
            onShowDatePicker={showDatePicker}
          />

          {officialLocation && place?.selection !== 'official' ? (
            <p className="location-schedule-note">Таблица {officialProvider?.label}: {officialLocation.name} — ближайший опубликованный пункт. Время и дата таблицы: {selectedTimeZone}.</p>
          ) : null}
          {locationNotice ? <p role="status" className="location-schedule-note">{locationNotice}</p> : null}
          <ScheduleContent
            schedule={schedule}
            key={contextKey}
            schedules={schedules}
            scheduleLoading={scheduleLoading}
            scheduleError={resolution?.kind === 'calculated' && resolution.status === 'unsupported'
              ? (() => { const capability = services.getCalculationProfileCapability(resolution.settings.profile); return capability.supported ? scheduleError : capability.reason })() : scheduleError}
            selectedDate={selectedDate}
            today={today}
            currentTime={currentTime}
            now={services.now}
            officialMode={officialMode}
            officialProviderName={officialProvider?.label}
            calculationSettings={calculationSettings}
            officialScheduleUrl={meta?.source.url ?? PRAYER_PROVIDERS[0]?.bundled.source.url ?? ''}
            methodologyButtonRef={footerMethodologyButtonRef}
            onChangeDate={changeDate}
            onRetrySchedule={() => { retrySchedule(); if (officialMode) void services.refresh() }}
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

      {!locationDialogOpen && !settingsDialogOpen ? persistenceNotice : null}

      <LocationDialog
        persistenceNotice={persistenceNotice}
        locations={locations}
        cityCatalog={cityCatalog}
        cityCatalogStatus={cityCatalogStatus}
        selectedOfficialId={officialMode ? locationId : null}
        selectedCityId={officialMode ? null : place?.cityId ?? null}
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
        persistenceNotice={persistenceNotice}
        open={settingsDialogOpen}
        officialMode={officialMode}
        settings={calculationSettings}
        preferences={preferences}
        onSourceChange={updatePreferences}
        focusMethodologyOnOpen={settingsFocusMethodology}
        methodologyTriggerRef={settingsMethodologyButtonRef}
        getCalculationProfileCapability={services.getCalculationProfileCapability}
        onClose={closeSettingsDialog}
        onChange={updateCalculationSettings}
        onOpenMethodology={() => openMethodologyDialog('settings')}
      />
      <MethodologyDialog
        open={methodologyDialogOpen}
        officialScheduleUrl={meta?.source.url ?? PRAYER_PROVIDERS[0]?.bundled.source.url ?? ''}
        onClose={closeMethodologyDialog}
      />
      <ShareDialog open={shareDialogOpen} onClose={closeShareDialog} />
    </main>
  )
}
