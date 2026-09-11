import { staticText } from './ui/staticText'
import { DEFAULT_CALENDAR_PREFERENCES, restoreCalendarPreferences, supportsHijriCalendar, type CalendarPreferences } from './domain/calendar'
import { DateScreen } from './features/calendar/DateScreen'
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
import { getDeviceTimeZone } from './domain/locationTime'
import type { Result } from './domain/result'
import { LocationScreen, SearchScreen } from './features/location/LocationScreens'
import { flushSync } from 'react-dom'
import { placeFromChoice } from './domain/placeMigration'
import { rememberPlace, restoreRecentPlaces } from './domain/recentPlaces'
import type { Place } from './domain/place'
import { compactPlaceLabel } from './domain/countryLabels'
import { useCityCatalog } from './features/location/useCityCatalog'
import { MethodologyDialog } from './features/methodology/MethodologyDialog'
import { ScheduleContent } from './features/schedule/ScheduleContent'
import { usePrayerSchedules } from './features/schedule/usePrayerSchedules'
import { useScheduleDate } from './features/schedule/useScheduleDate'
import { SettingsScreens } from './features/settings/SettingsScreens'
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
import { AppShell } from './ui/AppShell'
import { AppHeader } from './ui/AppHeader'
import { SourceInfo } from './features/source/SourceInfo'
import { useDataReset } from './features/settings/useDataReset'
import { BackButton, Screen } from './ui/Screen'
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

function LoadingScreen() {
  return (
    <AppShell>
      <Screen label="Загрузка" busy contentClassName="screen-center">
        <p className="note" role="status">Открываем расписание…</p>
      </Screen>
    </AppShell>
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
  const [storedCalendarPreferences, setCalendarPreferences] = useState(DEFAULT_CALENDAR_PREFERENCES)
  const [hijriSupported] = useState(supportsHijriCalendar)
  const calendarPreferences: CalendarPreferences = hijriSupported ? storedCalendarPreferences : { ...storedCalendarPreferences, calendar: 'gregorian' }
  const persistence = useSettingsPersistence(services.saveSettings)
  const saveSettings = persistence.save
  const invalidateSaves = persistence.invalidateAndDrain
  const [recentPlaces, setRecentPlaces] = useState<Place[]>([])
  const recentRef = useRef<Place[]>([])
  const previousPlace = useRef<Place | null>(null)
  const persistPlace = useCallback((choice: LocationChoice) => {
    const next = placeFromChoice(choice, DEFAULT_OFFICIAL_LOCATIONS)
    if (!next) return
    const recent = rememberPlace(recentRef.current, previousPlace.current, next)
    previousPlace.current = next
    recentRef.current = recent
    setRecentPlaces(recent)
    saveSettings({ locationChoice: choice, recentPlaces: recent })
  }, [saveSettings])
  const navigation = useAppNavigation()
  const { open: openScreen, back: backScreen, home: homeScreen } = navigation
  const sessionHasPlace = useRef(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const locationDialogOpen = navigation.screen === 'location' || navigation.screen === 'search'
  const settingsDialogOpen = ['settings', 'source', 'source-choice', 'profiles', 'parameters', 'privacy', 'reset', 'about'].includes(navigation.screen)
  const methodologyDialogOpen = navigation.screen === 'methodology'
  const shareDialogOpen = navigation.screen === 'share'
  const [retryCount, setRetryCount] = useState(0)
  const locationButtonRef = useRef<HTMLButtonElement>(null)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)

  const closeLocationDialog = useCallback(() => {
    backScreen()
  }, [backScreen])
  const onPlaceChosen = useCallback(() => { homeScreen(); pulseHaptic() }, [homeScreen])
  const locations = useMemo(() => meta?.locations ?? DEFAULT_OFFICIAL_LOCATIONS, [meta])
  const { place, notice: locationNotice, restore, locate: locateAutomatically,
    selectOfficial: selectOfficialLocation, selectCity: selectPresetCity, selectRecent, invalidate: invalidateLocation } = usePlaceSelection(services, locations, onPlaceChosen, persistPlace)
  const { reset, resetting } = useDataReset({ invalidateLocation, invalidateSaves,
    invalidateRepository: services.invalidateAndDrain, clear: services.clearAppData ?? prayerRepository.clearAppData,
    getGeneration: services.getDataGeneration ?? prayerRepository.getDataGeneration })
  useEffect(() => {
    document.documentElement.dataset.theme = 'dark'
    return () => { delete document.documentElement.dataset.theme }
  }, [])
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
      previousPlace.current = state.locationChoice ? placeFromChoice(state.locationChoice, state.meta?.locations ?? DEFAULT_OFFICIAL_LOCATIONS) : null
      const recent = restoreRecentPlaces(state.recentPlaces, previousPlace.current?.id)
      recentRef.current = recent
      setRecentPlaces(recent)
      setPreferences(state.preferences)
      setCalendarPreferences(restoreCalendarPreferences(state.calendarPreferences))
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

  const { cityCatalogStatus, loadCities } = useCityCatalog(services)
  const deviceTimeZone = services.getDeviceTimeZone()
  const todayResolution = place ? resolvePrayerTimeSource(place, services.now(), preferences, datasets, capabilities) : null
  const calendarTimeZone = todayResolution?.timeZone ?? place?.timeZone ?? deviceTimeZone
  const {
    selectedDate,
    currentTime,
    today,
    changeDate,
  } = useScheduleDate(services, calendarTimeZone)
  const resolution = place ? resolvePrayerTimeSource(place, selectedDate, preferences, datasets, capabilities) : null
  const officialMode = resolution?.kind === 'official'
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

  const openSettingsDialog = useCallback(() => { openScreen('settings') }, [openScreen])

  if (loading) return <LoadingScreen />

  if (error) {
    return (
      <AppShell>
        <Screen label="Ошибка загрузки" contentClassName="screen-center">
          <p role="alert">{error}</p>
          <button className="pill" type="button" onClick={() => setRetryCount((count) => count + 1)}>
            Попробовать снова
          </button>
        </Screen>
      </AppShell>
    )
  }

  const updatePreferences = (next: SourcePreferences) => {
    setPreferences(next)
    persistence.save({ sourcePreferences: next })
  }
  const updateCalendarPreferences = (next: CalendarPreferences) => {
    setCalendarPreferences(next)
    persistence.save({ calendarPreferences: next })
  }
  const calculatedLocationLabel = compactPlaceLabel(place?.name ?? 'Выберите место')
  const dialogOpen = locationDialogOpen
    || settingsDialogOpen
    || methodologyDialogOpen
    || shareDialogOpen
    || navigation.screen === 'source-info'
    || navigation.screen === 'date'

  const persistenceNotice = persistence.status === 'failed' ? (
        <div className="screen-status" role="status">
          <span>Не удалось сохранить изменения</span>
          <button type="button" className="pill" onClick={persistence.retry}>Повторить</button>
        </div>
      ) : null

  return (
    <AppShell>
      {!dialogOpen ? <div
        className="app-background screen-background"
      >
          {!place ? <LocationScreen initial place={null} recentPlaces={recentPlaces} onSelectRecent={selectRecent}
            onBack={backScreen} onSearch={() => { flushSync(() => openScreen('search')); document.querySelector<HTMLInputElement>('input[type="search"]')?.focus() }} onLocate={locateAutomatically}
            notice={persistenceNotice} bottom={<button id="home-settings" className="pill screen-end" type="button" onClick={openSettingsDialog}>Настройки</button>} /> : <ScheduleContent
            schedule={schedule}
            schedules={schedules}
            scheduleLoading={scheduleLoading}
            scheduleError={resolution?.kind === 'calculated' && resolution.status === 'unsupported'
              ? (() => { const capability = services.getCalculationProfileCapability(resolution.settings.profile); return capability.supported ? scheduleError : capability.reason })() : scheduleError}
            selectedDate={selectedDate}
            calendarPreferences={calendarPreferences}
            today={today}
            currentTime={currentTime}
            now={services.now}
            officialMode={officialMode}
            top={<AppHeader locationButtonRef={locationButtonRef} locationLabel={calculatedLocationLabel} selectedDate={selectedDate}
              calendarPreferences={calendarPreferences} onOpenLocation={openLocationDialog} onOpenDate={() => openScreen('date')} />}
            actions={<button className="pill screen-end" id="home-settings" ref={settingsButtonRef} type="button" onClick={openSettingsDialog}>Настройки</button>}
            notice={<>{locationNotice ? <p className="note" role="status">{locationNotice}</p> : null}{persistenceNotice}</>}
            onChangeDate={changeDate}
            onRetrySchedule={() => { retrySchedule(); if (officialMode) void services.refresh() }}
          />}

      </div> : null}

      {navigation.screen === 'date' ? <DateScreen selectedDate={selectedDate} today={today} preferences={calendarPreferences} hijriSupported={hijriSupported}
        onDateChange={changeDate} onPreferencesChange={updateCalendarPreferences} onBack={backScreen} notice={persistenceNotice} /> : null}

      {navigation.screen === 'location' ? <LocationScreen place={place} recentPlaces={recentPlaces} onSelectRecent={selectRecent}
        onBack={closeLocationDialog} onSearch={() => { flushSync(() => openScreen('search')); document.querySelector<HTMLInputElement>('input[type="search"]')?.focus() }} onLocate={locateAutomatically} notice={persistenceNotice} /> : null}
      {navigation.screen === 'search' ? <SearchScreen locations={locations} catalogStatus={cityCatalogStatus} onLoadCities={loadCities}
        onSearchCities={services.cities.search} onBack={backScreen} onSelectCity={selectPresetCity} onSelectOfficial={selectOfficialLocation} notice={persistenceNotice} /> : null}
      {navigation.screen === 'source-info' ? schedule && context
        ? <SourceInfo open onClose={backScreen} context={context} schedule={schedule} meta={meta} placeLabel={calculatedLocationLabel}
            checkedAt={repositoryState.checkedAt} updateFailed={repositoryState.update.status === 'failed'} onOpenMethodology={() => openScreen('methodology')} />
        : <Screen label="О расписании" top={<BackButton onClick={backScreen} />}><p className="screen-copy">{place ? 'Нет расписания для места или даты' : 'Сначала выберите место'}</p></Screen>
        : null}
      {settingsDialogOpen ? <SettingsScreens screen={navigation.screen} preferences={preferences} onChange={updatePreferences}
        onOpen={openScreen} onBack={backScreen} getCapability={services.getCalculationProfileCapability} onReset={reset} version={version} notice={persistenceNotice}
        sourceLabel={officialMode ? 'ДУМ РТ' : CALCULATION_PROFILES.find(profile => profile.id === calculationSettings.profile)?.label ?? 'Авто'} /> : null}
      <MethodologyDialog open={methodologyDialogOpen} officialScheduleUrl={meta?.source.url ?? PRAYER_PROVIDERS[0]?.bundled.source.url ?? ''} onClose={backScreen} />
      <ShareDialog open={shareDialogOpen} onClose={backScreen} />
    </AppShell>
  )
}
