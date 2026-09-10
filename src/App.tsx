import { staticText } from './ui/staticText'
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
import { automaticPreferences, type SourcePreferences } from './domain/sourcePreferences'
import { effectiveCalculationSettings } from './domain/calculationSettings'
import { useSettingsPersistence } from './features/settings/useSettingsPersistence'
import { usePlaceSelection } from './features/location/usePlaceSelection'
import type { GeolocationFailure } from './domain/errors'
import {
  DEFAULT_CALCULATION_SETTINGS,
  CALCULATION_PROFILES,
  getCalculationProfileCapability,
  type CalculationProfileCapability,
  type CalculationProfileId,
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
import { SourceBadge, SourceInfo } from './features/source/SourceInfo'
import { useDataReset } from './features/settings/useDataReset'
import type { Appearance } from './storage/database'
import { Screen } from './ui/Screen'
import { useAppNavigation } from './ui/useAppNavigation'

export interface AppServices extends Partial<Pick<typeof prayerRepository, 'clearAppData' | 'getDataGeneration'>>, Pick<typeof prayerRepository, 'initialize' | 'refresh' | 'subscribe' | 'getDays' | 'saveSettings' | 'invalidateAndDrain'> {
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

function LoadingScreen() {
  return (
    <main className="app-layout">
      <Screen label="Загрузка" busy contentClassName="screen-center">
        <p className="note" role="status">Открываем расписание…</p>
      </Screen>
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
  const invalidateSaves = persistence.invalidateAndDrain
  const persistPlace = useCallback((choice: LocationChoice) => saveSettings({ locationChoice: choice }), [saveSettings])
  const [appearance, setAppearance] = useState<Appearance>('system')
  const [sourceOpen, setSourceOpen] = useState<string | null>(null)
  const [settingsReturnFocus, setSettingsReturnFocus] = useState<string | null>(null)
  const navigation = useAppNavigation()
  const { open: openScreen, back: backScreen, home: homeScreen } = navigation
  const sessionHasPlace = useRef(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const locationDialogOpen = navigation.screen === 'location'
  const settingsDialogOpen = navigation.screen === 'settings'
  const [settingsFocusMethodology, setSettingsFocusMethodology] = useState(false)
  const methodologyDialogOpen = navigation.screen === 'methodology'
  const shareDialogOpen = navigation.screen === 'share'
  const [retryCount, setRetryCount] = useState(0)
  const locationButtonRef = useRef<HTMLButtonElement>(null)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  const settingsMethodologyButtonRef = useRef<HTMLButtonElement>(null)

  const closeLocationDialog = useCallback(() => {
    backScreen()
  }, [backScreen])
  const onPlaceChosen = useCallback(() => { homeScreen(); pulseHaptic() }, [homeScreen])
  const locations = useMemo(() => meta?.locations ?? DEFAULT_OFFICIAL_LOCATIONS, [meta])
  const { place, notice: locationNotice, restore, locate: locateAutomatically,
    selectOfficial: selectOfficialLocation, selectCity: selectPresetCity, changeTimeZone, invalidate: invalidateLocation } = usePlaceSelection(services, locations, onPlaceChosen, persistPlace)
  const { reset, resetting } = useDataReset({ invalidateLocation, invalidateSaves,
    invalidateRepository: services.invalidateAndDrain, clear: services.clearAppData ?? prayerRepository.clearAppData,
    getGeneration: services.getDataGeneration ?? prayerRepository.getDataGeneration })
  useEffect(() => {
    document.documentElement.dataset.theme = appearance
    return () => { delete document.documentElement.dataset.theme }
  }, [appearance])
  useEffect(() => () => { void invalidateSaves() }, [invalidateSaves])
  useEffect(() => {
    if (place && !sessionHasPlace.current && !resetting.current) void services.refresh()
    sessionHasPlace.current = Boolean(place)
  }, [place, resetting, services])
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
      setAppearance(state.appearance ?? 'system')
      sessionHasPlace.current = Boolean(state.locationChoice)
      setLoading(false)
    }
    const unsubscribe = services.subscribe(snapshot => { if (active) setRepositoryState(snapshot) })
    const refresh = () => { if (sessionHasPlace.current && !resetting.current) void services.refresh() }
    void services.initialize().then((result) => {
      if (!active) return
      if (!result.ok) {
        setError(staticText('app-copy-2'))
        return
      }
      acceptState(result.value)
      refresh()
    }).catch(() => active && setError(staticText('app-copy-2')))
      .finally(() => active && setLoading(false))
    window.addEventListener('online', refresh)
    window.addEventListener('pageshow', refresh)
    return () => { active = false; unsubscribe(); window.removeEventListener('online', refresh); window.removeEventListener('pageshow', refresh); void services.invalidateAndDrain() }
  }, [retryCount, services, restore, resetting])

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
    context,
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
    openScreen('location')
  }, [openScreen])

  const closeSettingsDialog = useCallback(() => {
    backScreen()
    setSettingsFocusMethodology(false)
    requestAnimationFrame(() => settingsButtonRef.current?.focus())
  }, [backScreen])
  const openSettingsDialog = useCallback(() => {
    setSettingsReturnFocus(null)
    setSettingsFocusMethodology(false)
    openScreen('settings')
  }, [openScreen])
  const openMethodologyDialog = useCallback(() => {
    openScreen('methodology')
  }, [openScreen])
  const closeMethodologyDialog = useCallback(() => {
    setSettingsFocusMethodology(true)
    backScreen()
  }, [backScreen])
  const closeShareDialog = useCallback(() => {
    backScreen()
    setSettingsReturnFocus('settings-share')
  }, [backScreen])

  if (loading) return <LoadingScreen />

  if (error) {
    return (
      <main className="app-layout">
        <Screen label="Ошибка загрузки" contentClassName="screen-center">
          <p role="alert">{error}</p>
          <button className="pill" type="button" onClick={() => setRetryCount((count) => count + 1)}>
            Попробовать снова
          </button>
        </Screen>
        </main>
    )
  }

  const selectedLocation = officialLocation ?? undefined
  const updatePreferences = (next: SourcePreferences) => {
    setPreferences(next)
    persistence.save({ sourcePreferences: next })
  }
  const calculatedLocationLabel = place?.name ?? 'Выберите место'
  const timeZoneOffset = canonicalTimeZone(selectedTimeZone) === canonicalTimeZone(deviceTimeZone)
    ? null
    : getUtcOffset(currentTime, selectedTimeZone)
  const dialogOpen = locationDialogOpen
    || settingsDialogOpen
    || methodologyDialogOpen
    || shareDialogOpen
    || navigation.screen === 'source-info'

  const persistenceNotice = persistence.status === 'failed' ? (
        <div className="persistence-notice" role="status">
          <span>Изменение действует сейчас, но сохранить его не удалось</span>
          <button type="button" className="primary-button" onClick={persistence.retry}>Повторить</button>
        </div>
      ) : null

  return (
    <main className="app-layout">
      <div
        className="app-background screen-background"
        inert={dialogOpen || undefined}
        aria-hidden={dialogOpen || undefined}
      >
        <Screen label="Главная">
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

          {locationNotice ? <p role="status" className="location-schedule-note">{locationNotice}</p> : null}
          {!place ? <div className="first-install"><h2>Время намаза для вашего места</h2><p>{staticText('app-copy-1')}</p><button className="primary-button" type="button" onClick={openLocationDialog}>Выбрать место</button></div> : <ScheduleContent
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
            sourceBadge={schedule && context && !scheduleLoading && !scheduleError ? <SourceBadge context={context} onOpen={() => { setSourceOpen(contextKey); openScreen('source-info') }} /> : null}
            onChangeDate={changeDate}
            onRetrySchedule={() => { retrySchedule(); if (officialMode) void services.refresh() }}
          />}
        </Screen>

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
      {schedule && context ? <SourceInfo open={navigation.screen === 'source-info' && sourceOpen === contextKey} onClose={() => { setSourceOpen(null); backScreen() }} context={context} schedule={schedule} meta={meta} placeLabel={calculatedLocationLabel} checkedAt={repositoryState.checkedAt} updateFailed={repositoryState.update.status === 'failed'} /> : null}
      <SettingsDialog
        returnFocusId={settingsReturnFocus}
        appearance={appearance}
        onAppearanceChange={value => { setAppearance(value); persistence.save({ appearance: value }) }}
        placeLabel={calculatedLocationLabel}
        timeZone={place?.timeZone ?? ''}
        version={version}
        onReset={reset}
        onOpenLocation={() => { openScreen('location') }}
        onOpenShare={() => { openScreen('share') }}
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
        onOpenMethodology={openMethodologyDialog}
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
