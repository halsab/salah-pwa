import { DEFAULT_CALENDAR_PREFERENCES, restoreCalendarPreferences, supportsHijriCalendar, type CalendarPreferences } from './domain/calendar'
import { DateScreen } from './features/calendar/DateScreen'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import type { CityCatalogService } from './data/cityCatalog'
import { cityCatalogService } from './data/cityCatalogClient'
import { prayerRepositories, prayerRepository, type PrayerRepositoryState, type PrayerRepositorySnapshot,
  type PrayerRepositoryOptionalSettings } from './data/prayerRepository'
import { loadLocalGeography } from './data/localGeography'
import type { CoverageGeometry } from './domain/localGeography'
import { PRAYER_PROVIDERS, DEFAULT_OFFICIAL_LOCATIONS, officialDatasets } from './data/prayerProviders'
import { initialManualCalculation, resolvePrayerTimeSource } from './domain/prayerSource'
import { automaticPreferences, type SourcePreferences } from './domain/sourcePreferences'
import { effectiveCalculationSettings } from './domain/calculationSettings'
import { useSettingsPersistence } from './features/settings/useSettingsPersistence'
import { usePlaceSelection, type PlacePersistenceChange } from './features/location/usePlaceSelection'
import { nameLookupMessage } from './features/location/locationState'
import type { GeolocationFailure } from './domain/errors'
import {
  DEFAULT_CALCULATION_SETTINGS,
  CALCULATION_PROFILES,
  getCalculationProfileCapability,
  type CalculationProfileCapability,
  type CalculationProfileId,
} from './domain/prayerCalculation'
import { getDeviceTimeZone, getUtcOffset, getZonedTime } from './domain/locationTime'
import { getSystemDate } from './domain/date'
import type { Result } from './domain/result'
import { failure } from './domain/result'
import { LocationScreen, SearchScreen } from './features/location/LocationScreens'
import { flushSync } from 'react-dom'
import { placeFromChoice } from './domain/placeMigration'
import { migrateRecentPlaces, rememberPlace, restoreRecentPlaces, updateRecentPlace } from './domain/recentPlaces'
import { homePlaceLabel, type Place } from './domain/place'
import { compactPlaceLabel } from './domain/countryLabels'
import { useCityCatalog } from './features/location/useCityCatalog'
import { ScheduleContent } from './features/schedule/ScheduleContent'
import { ReligiousEventsScreen } from './features/religiousEvents/ReligiousEventsScreen'
import { usePrayerSchedules } from './features/schedule/usePrayerSchedules'
import { activateFastScheduleContext, currentFastScheduleGeneration, FAST_SCHEDULE_STORAGE_KEYS, invalidateFastScheduleSnapshot,
  notifyFastScheduleSelectionChanged, readFastScheduleSnapshot, writeFastScheduleSnapshot } from './features/schedule/fastScheduleSnapshot'
import { useScheduleDate } from './features/schedule/useScheduleDate'
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
import { ActionButton, IconActionButton, ScreenFooter } from './ui/controls'
import { useDataReset } from './features/settings/useDataReset'
import { BackButton, Screen } from './ui/Screen'
import { useAppNavigation, type AppScreen } from './ui/useAppNavigation'
import { restoreThemeFamily, type ThemeFamily } from './domain/theme'
import { applyTheme, resolveTheme } from './ui/theme'
import { clearThemePreferenceCache, isThemeFamily, isThemePreferenceCacheEvent, themeFamilyFromCacheEvent, readThemePreferenceCache, writeThemePreferenceCache } from './ui/themePreferenceCache'
import { useSystemAppearance } from './ui/useSystemAppearance'
import { setLanguagePreference, useLocalization } from './localization'
import { PROFILE_LABEL_KEYS } from './ui/calculationLabels'
import { getDatasetRevision, scheduleContextKey } from './domain/scheduleContext'
import {
  DEFAULT_FASTING_MODE_PREFERENCES,
  buildFastingScheduleEvents,
  isFastingModeActive,
  resolveActiveRamadanOccurrence,
  restoreFastingModePreferences,
  updateFastingModePreferences,
  type FastingModePreferences,
} from './domain/fasting'

const loadSecondaryScreens = () => import('./features/SecondaryScreens')
const SECONDARY_SCREENS: readonly AppScreen[] = ['settings', 'source', 'source-choice', 'profiles', 'parameters', 'source-info', 'methodology', 'privacy', 'reset', 'about']
const loadReligiousEventScreen = () => import('./features/religiousEvents/ReligiousEventScreen')
export interface AppServices extends Partial<Pick<typeof prayerRepository,
  'clearAppData' | 'getDataGeneration' | 'initializeStartup' | 'loadOptionalSettings'>>,
  Pick<typeof prayerRepository, 'initialize' | 'refresh' | 'subscribe' | 'saveSettings' | 'invalidateAndDrain'> {
  getDays: (locationId: string, dates: readonly string[], revision: string, provider: string) => ReturnType<typeof prayerRepository.getDays>
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
  getDays: (locationId, dates, revision, provider) => {
    const repository = prayerRepositories.get(provider)
    return repository ? repository.getDays(locationId, dates, revision)
      : Promise.resolve(failure({ kind: 'data', reason: 'unavailable' }))
  },
  cities: cityCatalogService,
  loadGeography: loadLocalGeography,
  getPermission: getGeolocationPermission,
  getPosition: getCurrentPosition,
  getDeviceTimeZone,
  getCalculationProfileCapability,
  now: () => new Date(),
}

export function App({
  services = defaultServices,
  version = (import.meta.env.VITE_APP_VERSION
    || import.meta.env.VITE_APP_PACKAGE_VERSION) as string | undefined,
}: {
  services?: AppServices
  version?: string
}) {
  const { locale, t } = useLocalization()
  const appVersion: string = version || (import.meta.env.VITE_APP_PACKAGE_VERSION as string | undefined) || 'dev'
  const [startupSnapshot] = useState(() => {
    try {
      return readFastScheduleSnapshot({ appVersion, now: services.now(), deviceTimeZone: services.getDeviceTimeZone() })
    } catch {
      return null
    }
  })
  const [fastGeneration, setFastGeneration] = useState<string | null>(() => startupSnapshot?.generation ?? currentFastScheduleGeneration())
  const [fastCacheReady, setFastCacheReady] = useState(false)
  const pendingFastIdentityWrite = useRef(false)
  const fastGenerationRef = useRef(fastGeneration)
  const activeFastContext = useRef(startupSnapshot ? scheduleContextKey(startupSnapshot.context) : null)
  const selectionSyncToken = useRef(0)
  const optionalSettingsToken = useRef(0)
  const retryOptionalSettings = useRef<() => void>(() => {})
  const themePreferenceRevision = useRef(0)
  const lastRemoteThemeFamily = useRef<ThemeFamily | null>(null)
  const [remoteSelectionPending, setRemoteSelectionPending] = useState(false)
  const retrySelectionSync = useRef<() => void>(() => {})
  const invalidateFastCache = useCallback(() => {
    activeFastContext.current = null
    const generation = invalidateFastScheduleSnapshot()
    fastGenerationRef.current = generation
    setFastGeneration(generation)
  }, [])
  const [repositoryState, setRepositoryState] = useState<PrayerRepositorySnapshot>(() => ({
    meta: startupSnapshot?.meta ?? null,
    dataState: startupSnapshot?.meta ? 'ready' : 'not-loaded',
    update: { status: 'idle' }, checkedAt: null,
  }))
  const meta = repositoryState.meta
  const repositoryRevision = useRef(meta ? getDatasetRevision(meta) : null)
  const [preferences, setPreferences] = useState<SourcePreferences>(() => startupSnapshot?.preferences ?? automaticPreferences())
  const [storedCalendarPreferences, setCalendarPreferences] = useState<CalendarPreferences>(DEFAULT_CALENDAR_PREFERENCES)
  const [themeFamily, setThemeFamily] = useState<ThemeFamily>(readThemePreferenceCache)
  const [themeEditedLocally, setThemeEditedLocally] = useState(false)
  const persistedThemeFamily = useRef(themeFamily)
  const editedTheme = useRef(false)
  const [fastingMode, setFastingMode] = useState<FastingModePreferences>({ ...DEFAULT_FASTING_MODE_PREFERENCES })
  const [hijriSupported] = useState(supportsHijriCalendar)
  const calendarPreferences = useMemo<CalendarPreferences>(() => hijriSupported ? storedCalendarPreferences
    : { ...storedCalendarPreferences, calendar: 'gregorian' }, [hijriSupported, storedCalendarPreferences])
  const [error, setError] = useState(false)
  const [startupRecoveryError, setStartupRecoveryError] = useState(false)
  const [optionalSettingsError, setOptionalSettingsError] = useState(false)
  const [selectionSyncError, setSelectionSyncError] = useState(false)
  const [startupInitialized, setStartupInitialized] = useState(false)
  const initialRefreshStarted = useRef(false)
  const persistSettings = useCallback(async (
    patch: Parameters<AppServices['saveSettings']>[0],
    isCurrent?: Parameters<AppServices['saveSettings']>[1],
  ) => {
    const result = await services.saveSettings(patch, isCurrent)
    if (result.ok) {
      if ((patch.locationChoice || patch.sourcePreferences) && isCurrent?.()) {
        invalidateFastCache()
        pendingFastIdentityWrite.current = false
        setFastCacheReady(true)
        selectionSyncToken.current += 1
        setRemoteSelectionPending(false)
        setSelectionSyncError(false)
      }
      if (!(patch.themeFamily !== undefined && Object.keys(patch).length === 1)) {
        notifyFastScheduleSelectionChanged()
      }
    }
    return result
  }, [invalidateFastCache, services])
  const persistence = useSettingsPersistence(persistSettings)
  const saveSettings = persistence.save
  const rebaseSettings = persistence.rebase
  const invalidateSaves = persistence.invalidateAndDrain
  const acceptRemoteTheme = useCallback((nextThemeFamily: ThemeFamily) => {
    if (lastRemoteThemeFamily.current === nextThemeFamily) return
    lastRemoteThemeFamily.current = nextThemeFamily
    if (!editedTheme.current && persistedThemeFamily.current === nextThemeFamily) return
    themePreferenceRevision.current += 1
    editedTheme.current = false
    setThemeEditedLocally(false)
    persistedThemeFamily.current = nextThemeFamily
    setThemeFamily(nextThemeFamily)
    writeThemePreferenceCache(nextThemeFamily)
    saveSettings({ themeFamily: nextThemeFamily })
  }, [saveSettings])
  const themeChannel = useRef<BroadcastChannel | null>(null)
  useEffect(() => {
    if (persistence.status !== 'saved' || !themeEditedLocally) return
    persistedThemeFamily.current = themeFamily
    writeThemePreferenceCache(themeFamily)
    themeChannel.current?.postMessage(themeFamily)
  }, [persistence.status, themeFamily, themeEditedLocally])
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel('salah-theme-preference-v1')
    themeChannel.current = channel
    channel.onmessage = event => { if (isThemeFamily(event.data)) acceptRemoteTheme(event.data) }
    return () => { themeChannel.current = null; channel.close() }
  }, [acceptRemoteTheme])
  const [recentPlaces, setRecentPlaces] = useState<Place[]>([])
  const editedPreferences = useRef(false)
  const editedCalendar = useRef(false)
  const editedFasting = useRef(false)
  const editedRecentPlaces = useRef(false)
  const recentPlacesLoaded = useRef(false)
  const recentPlacesMigrationComplete = useRef(false)
  const [activeHistoryId, setActiveHistoryId] = useState<string | undefined>()
  const recentRef = useRef<Place[]>([])
  const previousPlace = useRef<Place | null>(null)
  const historyAnchorPlace = useRef<Place | null>(null)
  const legacyHistoryAnchorCaptured = useRef(false)
  const acceptedGpsHistory = useRef<{ runtimeId: string; historyId: string } | null>(null)
  const pendingPlaceChoice = useRef<LocationChoice | null>(null)
  const persistPlace = useCallback((choice: LocationChoice, change: PlacePersistenceChange = 'automatic') => {
    selectionSyncToken.current += 1
    setRemoteSelectionPending(false)
    setSelectionSyncError(false)
    pendingFastIdentityWrite.current = true
    setFastCacheReady(false)
    invalidateFastCache()
    const next = placeFromChoice(choice, DEFAULT_OFFICIAL_LOCATIONS)
    if (!next) return
    // Не затираем legacy history явным выбором, пока её ещё не прочитали.
    const deferSelectionSnapshot = Boolean(services.loadOptionalSettings && !recentPlacesLoaded.current
      && (change === 'selection' || pendingPlaceChoice.current))
    let patch: { locationChoice: LocationChoice; recentPlaces?: Place[]; recentPlacesMigrated?: boolean } = { locationChoice: choice }
    if (change === 'selection') {
      const existing = recentPlacesLoaded.current ? recentRef.current
        : recentPlacesMigrationComplete.current ? restoreRecentPlaces(recentRef.current)
          : migrateRecentPlaces(recentRef.current, historyAnchorPlace.current)
      const recent = rememberPlace(existing, next)
      recentRef.current = recent
      editedRecentPlaces.current = true
      recentPlacesMigrationComplete.current = true
      setRecentPlaces(recent)
      patch = { ...patch, recentPlaces: recent, recentPlacesMigrated: true }
      setActiveHistoryId(next.selection === 'gps' ? recent[0]?.id : undefined)
      acceptedGpsHistory.current = next.selection === 'gps' && recent[0]
        ? { runtimeId: next.id, historyId: recent[0].id }
        : null
    } else if (change === 'refinement') {
      const historyId = acceptedGpsHistory.current?.runtimeId === next.id ? acceptedGpsHistory.current.historyId : undefined
      const recent = updateRecentPlace(recentRef.current, next, historyId)
      if (recent !== recentRef.current && JSON.stringify(recent) !== JSON.stringify(recentRef.current)) {
        recentRef.current = recent
        editedRecentPlaces.current = true
        setRecentPlaces(recent)
        patch = { ...patch, recentPlaces: recent }
      }
    }
    previousPlace.current = next
    if (deferSelectionSnapshot) pendingPlaceChoice.current = choice
    else saveSettings(patch)
  }, [invalidateFastCache, saveSettings, services.loadOptionalSettings])
  const navigation = useAppNavigation()
  const { open: openImmediately, openPrepared: openScreenPrepared, back: backScreen, home: homeScreen } = navigation
  const [secondaryScreens, setSecondaryScreens] = useState<typeof import('./features/SecondaryScreens') | null>(null)
  const [screenLoadFailed, setScreenLoadFailed] = useState(false)
  const openScreen = useCallback((target: AppScreen) => {
    setScreenLoadFailed(false)
    if (!secondaryScreens && SECONDARY_SCREENS.includes(target)) {
      void openScreenPrepared(target, async () => {
        const screens = await loadSecondaryScreens()
        flushSync(() => setSecondaryScreens(screens))
      }).catch(() => setScreenLoadFailed(true))
    } else openImmediately(target)
  }, [openImmediately, openScreenPrepared, secondaryScreens])
  const SettingsScreens = secondaryScreens?.SettingsScreens
  const SourceInfo = secondaryScreens?.SourceInfo
  const MethodologyDialog = secondaryScreens?.MethodologyDialog
  const sessionHasPlace = useRef(Boolean(startupSnapshot?.place))
  const [religiousEventScreen, setReligiousEventScreen] = useState<typeof import('./features/religiousEvents/ReligiousEventScreen')['ReligiousEventScreen'] | null>(null)
  const [religiousEventLoadError, setReligiousEventLoadError] = useState<string | null>(null)
  const locationDialogOpen = navigation.screen === 'location' || navigation.screen === 'search'
  const settingsDialogOpen = ['settings', 'source', 'source-choice', 'profiles', 'parameters', 'privacy', 'reset', 'about'].includes(navigation.screen)
  const methodologyDialogOpen = navigation.screen === 'methodology'
  const shareDialogOpen = navigation.screen === 'share'
  const [retryCount, setRetryCount] = useState(0)
  const locationButtonRef = useRef<HTMLButtonElement>(null)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  const LoadedReligiousEventScreen = religiousEventScreen

  const onPlaceChosen = useCallback(() => { homeScreen(); pulseHaptic() }, [homeScreen])
  const locations = useMemo(() => meta?.locations ?? DEFAULT_OFFICIAL_LOCATIONS, [meta])
  const { place, gpsPreview, source: placeSelectionSource, notice: locationNotice, gpsState, nameLookupState, restore, locate: locateAutomatically, acceptGps,
    cancelInteractive: cancelInteractiveGps,
    selectOfficial: selectOfficialLocation, selectCity: selectPresetCity, selectRecent, invalidate: invalidateLocation } = usePlaceSelection(
    services, locations, onPlaceChosen, persistPlace,
    startupSnapshot ? { place: startupSnapshot.place, source: startupSnapshot.selectionSource } : undefined,
  )
  const closeLocationDialog = useCallback(() => {
    cancelInteractiveGps()
    backScreen()
  }, [backScreen, cancelInteractiveGps])
  const { reset, resetting } = useDataReset({ invalidateLocation, invalidateSaves,
    invalidateRepository: services.invalidateAndDrain, clear: services.clearAppData ?? prayerRepository.clearAppData,
    getGeneration: services.getDataGeneration ?? prayerRepository.getDataGeneration })
  const locationSelectionVisible = navigation.screen === 'location' || (navigation.screen === 'home' && !place)
  const previousLocationSelectionVisible = useRef(locationSelectionVisible)
  useEffect(() => {
    const wasVisible = previousLocationSelectionVisible.current
    previousLocationSelectionVisible.current = locationSelectionVisible
    if (wasVisible && !locationSelectionVisible && navigation.screen !== 'search') cancelInteractiveGps()
  }, [cancelInteractiveGps, locationSelectionVisible, navigation.screen])
  const resetWithFastCache = useCallback(async () => {
    pendingPlaceChoice.current = null
    pendingFastIdentityWrite.current = true
    optionalSettingsToken.current += 1
    themePreferenceRevision.current += 1
    setFastCacheReady(false)
    invalidateFastCache()
    clearThemePreferenceCache()
    setThemeEditedLocally(false)
    const cleared = await reset()
    if (cleared) {
      lastRemoteThemeFamily.current = null
    } else {
      pendingFastIdentityWrite.current = false
      setFastCacheReady(true)
      themePreferenceRevision.current += 1
      editedTheme.current = false
      setThemeEditedLocally(false)
      setThemeFamily(persistedThemeFamily.current)
      lastRemoteThemeFamily.current = persistedThemeFamily.current
      writeThemePreferenceCache(persistedThemeFamily.current)
      retryOptionalSettings.current()
    }
    return cleared
  }, [invalidateFastCache, reset])
  useEffect(() => () => { void invalidateSaves() }, [invalidateSaves])
  useEffect(() => {
    sessionHasPlace.current = Boolean(place)
  }, [place])
  const datasets = useMemo(() => officialDatasets(meta, repositoryState.dataState), [meta, repositoryState.dataState])
  const capabilities = useMemo(() => CALCULATION_PROFILES.filter(p => services.getCalculationProfileCapability(p.id).supported).map(p => p.id), [services])

  useEffect(() => {
    let active = true
    const acceptState = (state: PrayerRepositoryState, announceRevision = true, selectionMode: 'startup' | 'external' = 'startup') => {
      if (!active) return
      if (selectionMode === 'external') rebaseSettings()
      const nextRevision = state.meta ? getDatasetRevision(state.meta) : null
      if (announceRevision && nextRevision && repositoryRevision.current && repositoryRevision.current !== nextRevision) {
        invalidateFastCache()
        notifyFastScheduleSelectionChanged()
      }
      repositoryRevision.current = nextRevision
      setRepositoryState(state)
      setFastCacheReady(!pendingFastIdentityWrite.current)
      restore(state.locationChoice, state.meta?.locations ?? DEFAULT_OFFICIAL_LOCATIONS, selectionMode)
      if (selectionMode === 'external' || !editedRecentPlaces.current) recentPlacesMigrationComplete.current = state.recentPlacesMigrated === true
      previousPlace.current = state.locationChoice
        ? placeFromChoice(state.locationChoice, state.meta?.locations ?? DEFAULT_OFFICIAL_LOCATIONS)
        : null
      if (state.recentPlacesMigrated === true) {
        historyAnchorPlace.current = previousPlace.current
        legacyHistoryAnchorCaptured.current = true
      } else if (!legacyHistoryAnchorCaptured.current) {
        historyAnchorPlace.current = previousPlace.current
        legacyHistoryAnchorCaptured.current = true
      }
      setActiveHistoryId(undefined)
      if (selectionMode === 'external') {
        editedPreferences.current = false
        editedRecentPlaces.current = false
        recentPlacesLoaded.current = false
        pendingPlaceChoice.current = null
        acceptedGpsHistory.current = null
        editedCalendar.current = false
        editedTheme.current = false
        setThemeEditedLocally(false)
        editedFasting.current = false
      }
      if (!editedRecentPlaces.current && state.recentPlaces !== undefined) {
        const recent = state.recentPlacesMigrated
          ? restoreRecentPlaces(state.recentPlaces)
          : migrateRecentPlaces(state.recentPlaces, historyAnchorPlace.current)
        recentPlacesLoaded.current = true
        recentPlacesMigrationComplete.current = true
        recentRef.current = recent
        setRecentPlaces(recent)
        if (state.recentPlacesMigrated !== true || JSON.stringify(recent) !== JSON.stringify(state.recentPlaces)) {
          editedRecentPlaces.current = true
          saveSettings({ ...(state.locationChoice ? { locationChoice: state.locationChoice } : {}), recentPlaces: recent, recentPlacesMigrated: true })
        }
      }
      if (!editedPreferences.current) setPreferences(state.preferences)
      if (state.languagePreference !== undefined) setLanguagePreference(state.languagePreference)
      if (!editedCalendar.current && state.calendarPreferences !== undefined) setCalendarPreferences(restoreCalendarPreferences(state.calendarPreferences))
      if (!editedTheme.current && state.themeFamily !== undefined) {
        const nextThemeFamily = restoreThemeFamily(state.themeFamily)
        themePreferenceRevision.current += 1
        lastRemoteThemeFamily.current = nextThemeFamily
        persistedThemeFamily.current = nextThemeFamily
        setThemeFamily(nextThemeFamily)
        writeThemePreferenceCache(nextThemeFamily)
      }
      if (!editedFasting.current && state.fastingMode !== undefined) setFastingMode(restoreFastingModePreferences(state.fastingMode))
      sessionHasPlace.current = Boolean(state.locationChoice)
      setError(false)
      setStartupRecoveryError(false)
      setOptionalSettingsError(false)
      setStartupInitialized(true)
      setRemoteSelectionPending(false)
    }
    const hydrateOptionalSettings = () => {
      if (!services.loadOptionalSettings) return
      retryOptionalSettings.current = () => hydrateOptionalSettings()
      const token = ++optionalSettingsToken.current
      const themeRevision = themePreferenceRevision.current
      void services.loadOptionalSettings().then(result => {
        if (!active || token !== optionalSettingsToken.current) return
        if (!result.ok) { setOptionalSettingsError(true); return }
        const value: PrayerRepositoryOptionalSettings = result.value
        if (!recentPlacesLoaded.current || !editedRecentPlaces.current) {
          // Сначала мигрируем прежнее место, затем сохраняем явные выборы этой вкладки по recency.
          const migrated = value.recentPlacesMigrated
            ? restoreRecentPlaces(value.recentPlaces)
            : migrateRecentPlaces(value.recentPlaces, historyAnchorPlace.current)
          const recent = editedRecentPlaces.current
            ? restoreRecentPlaces([...recentRef.current, ...migrated])
            : migrated
          recentPlacesLoaded.current = true
          recentPlacesMigrationComplete.current = true
          recentRef.current = recent
          setRecentPlaces(recent)
          const pendingChoice = pendingPlaceChoice.current
          if (pendingChoice || !value.recentPlacesMigrated || JSON.stringify(recent) !== JSON.stringify(value.recentPlaces)) {
            editedRecentPlaces.current = true
            pendingPlaceChoice.current = null
            saveSettings({ ...(pendingChoice ? { locationChoice: pendingChoice } : {}), recentPlaces: recent, recentPlacesMigrated: true })
          }
        }
        if (!editedCalendar.current) setCalendarPreferences(restoreCalendarPreferences(value.calendarPreferences))
        if (!editedTheme.current && themeRevision === themePreferenceRevision.current) {
          const nextThemeFamily = restoreThemeFamily(value.themeFamily)
          lastRemoteThemeFamily.current = nextThemeFamily
          persistedThemeFamily.current = nextThemeFamily
          setThemeFamily(nextThemeFamily)
          writeThemePreferenceCache(nextThemeFamily)
        }
        if (!editedFasting.current) setFastingMode(restoreFastingModePreferences(value.fastingMode))
        setLanguagePreference(value.languagePreference)
        setOptionalSettingsError(false)
      }).catch(() => {
        if (active && token === optionalSettingsToken.current) setOptionalSettingsError(true)
      })
    }
    const unsubscribe = services.subscribe(snapshot => {
      if (!active) return
      const nextRevision = snapshot.meta ? getDatasetRevision(snapshot.meta) : null
      if (nextRevision && repositoryRevision.current && repositoryRevision.current !== nextRevision) {
        repositoryRevision.current = nextRevision
        invalidateFastCache()
        notifyFastScheduleSelectionChanged()
      }
      setRepositoryState(snapshot)
    })
    const refresh = () => { if (sessionHasPlace.current && !resetting.current) void services.refresh() }
    const initialize = services.initializeStartup ?? services.initialize
    const startupGeneration = fastGenerationRef.current
    void initialize().then((result) => {
      if (!active) return
      setStartupInitialized(true)
      if (startupGeneration !== fastGenerationRef.current || currentFastScheduleGeneration() !== startupGeneration) return
      if (!result.ok) {
        if (startupSnapshot) setStartupRecoveryError(true)
        else setError(true)
        return
      }
      acceptState(result.value)
      hydrateOptionalSettings()
    }).catch(() => {
      if (!active) return
      setStartupInitialized(true)
      if (startupGeneration !== fastGenerationRef.current || currentFastScheduleGeneration() !== startupGeneration) return
      if (startupSnapshot) setStartupRecoveryError(true)
      else setError(true)
    })
    let remoteSyncInProgress = false
    let remoteSyncRequested = false
    const reconcileSelection = () => {
      if (remoteSyncInProgress) {
        remoteSyncRequested = true
        return
      }
      remoteSyncInProgress = true
      setSelectionSyncError(false)
      const generation = currentFastScheduleGeneration() ?? fastGenerationRef.current
      if (generation !== fastGenerationRef.current) {
        fastGenerationRef.current = generation
        setFastGeneration(generation)
        activeFastContext.current = null
        setRemoteSelectionPending(true)
      }
      const token = ++selectionSyncToken.current
      const initializeLatest = services.initializeStartup ?? services.initialize
      void initializeLatest().then(result => {
        if (!active || token !== selectionSyncToken.current || generation !== fastGenerationRef.current
          || currentFastScheduleGeneration() !== generation) return
        if (!result.ok) {
          setSelectionSyncError(true)
          setRemoteSelectionPending(true)
          return
        }
        acceptState(result.value, false, 'external')
        setSelectionSyncError(false)
        hydrateOptionalSettings()
      }).catch(() => {
        if (active && token === selectionSyncToken.current) {
          setSelectionSyncError(true)
          setRemoteSelectionPending(true)
        }
      }).finally(() => {
        remoteSyncInProgress = false
        if (active && remoteSyncRequested) {
          remoteSyncRequested = false
          if (selectionSyncToken.current === token) reconcileSelection()
        }
      })
    }
    retrySelectionSync.current = reconcileSelection
    const handleStorage = (event: StorageEvent) => {
      if (isThemePreferenceCacheEvent(event)) {
        const nextThemeFamily = themeFamilyFromCacheEvent(event)
        if (nextThemeFamily) acceptRemoteTheme(nextThemeFamily)
        return
      }
      if (event.key === FAST_SCHEDULE_STORAGE_KEYS.activeContext) {
        const generation = currentFastScheduleGeneration()
        if (generation && generation !== fastGenerationRef.current) {
          setRemoteSelectionPending(true)
          activeFastContext.current = null
          fastGenerationRef.current = generation
          setFastGeneration(generation)
          reconcileSelection()
        }
        return
      }
      if (event.key !== FAST_SCHEDULE_STORAGE_KEYS.changeSignal) return
      const generation = currentFastScheduleGeneration()
      if (generation && generation !== fastGenerationRef.current) {
        setRemoteSelectionPending(true)
        activeFastContext.current = null
        fastGenerationRef.current = generation
        setFastGeneration(generation)
      }
      reconcileSelection()
    }
    window.addEventListener('online', refresh)
    window.addEventListener('pageshow', refresh)
    window.addEventListener('storage', handleStorage)
    return () => {
      active = false
      retrySelectionSync.current = () => {}
      retryOptionalSettings.current = () => {}
      unsubscribe()
      window.removeEventListener('online', refresh)
      window.removeEventListener('pageshow', refresh)
      window.removeEventListener('storage', handleStorage)
      void services.invalidateAndDrain()
    }
  }, [retryCount, services, restore, resetting, startupSnapshot, invalidateFastCache, rebaseSettings, acceptRemoteTheme, saveSettings])

  const { cityCatalogStatus, loadCities } = useCityCatalog(services)
  const deviceTimeZone = services.getDeviceTimeZone()
  const {
    selectedDateOverride,
    currentTime,
    changeDate,
    syncCurrentTime,
  } = useScheduleDate(services)
  const currentResolution = place
    ? resolvePrayerTimeSource(place, currentTime, preferences, datasets, capabilities)
    : null
  const todayTimeZone = currentResolution?.timeZone ?? place?.timeZone ?? deviceTimeZone
  const today = getSystemDate(currentTime, todayTimeZone)
  const selectedDate = selectedDateOverride ?? today
  const resolution = place
    ? resolvePrayerTimeSource(place, selectedDate, preferences, datasets, capabilities)
    : null
  const changeScheduleDate = useCallback((date: string) => {
    changeDate(date === today ? null : date)
  }, [changeDate, today])
  const officialMode = resolution?.kind === 'official'
  const calculationSettings = resolution?.kind === 'calculated' ? resolution.settings
    : preferences.calculationDraft ? effectiveCalculationSettings(preferences.calculationDraft) : DEFAULT_CALCULATION_SETTINGS
  const scheduleServices = useMemo(() => ({
    getDays: async (nextLocationId: string, dates: readonly string[], datasetRevision: string, provider: string) => {
      const result = await services.getDays(nextLocationId, dates, datasetRevision, provider)
      if (!result.ok) throw Object.assign(new Error(result.error.reason), { kind: result.error.kind })
      return result.value
    },
  }), [services])
  const systemTone = useSystemAppearance()
  const theme = useMemo(() => resolveTheme(themeFamily, today, systemTone), [systemTone, themeFamily, today])
  useLayoutEffect(() => applyTheme(theme), [theme])
  const {
    schedule,
    context,
    contextKey: selectedContextKey,
    schedules,
    scheduleLoading,
    scheduleError,
    contextReady,
    officialHorizon,
    enrichmentError,
    retrySchedule,
    retryEnrichment,
  } = usePrayerSchedules({
    services: scheduleServices,
    location: place,
    resolution,
    mode: preferences.mode,
    selectedDate,
    initialSnapshot: selectedDate === today ? startupSnapshot : null,
  })
  useEffect(() => {
    if (!startupInitialized || !place || scheduleLoading || remoteSelectionPending || resetting.current || initialRefreshStarted.current) return
    initialRefreshStarted.current = true
    void services.refresh()
  }, [place, remoteSelectionPending, resetting, scheduleLoading, services, startupInitialized])
  const fastingEvents = useMemo(() => buildFastingScheduleEvents(schedules, context?.timeZone), [schedules, context?.timeZone])
  // Не используем расписания выбранной даты для вычисления режима текущего дня.
  const currentSchedules = usePrayerSchedules({
    services: scheduleServices,
    location: selectedDate === today ? null : place,
    resolution: selectedDate === today ? null : currentResolution,
    mode: preferences.mode,
    selectedDate: today,
    initialSnapshot: selectedDate === today ? null : startupSnapshot,
  })
  const todaySchedule = selectedDate === today ? schedule : currentSchedules.schedule
  const todaySchedules = selectedDate === today ? schedules : currentSchedules.schedules
  const todayContextReady = selectedDate === today ? contextReady : currentSchedules.contextReady
  const todayContext = selectedDate === today ? context : currentSchedules.context
  const todayContextKey = todayContext?.date === today
    ? selectedDate === today ? selectedContextKey : currentSchedules.contextKey
    : null
  useLayoutEffect(() => {
    if (remoteSelectionPending || pendingFastIdentityWrite.current || !todayContextKey || !fastGeneration) return
    if (activeFastContext.current && activeFastContext.current !== todayContextKey) {
      invalidateFastCache()
      return
    }
    if (activateFastScheduleContext(todayContextKey, fastGeneration)) activeFastContext.current = todayContextKey
  }, [fastCacheReady, fastGeneration, invalidateFastCache, remoteSelectionPending, todayContextKey])
  useEffect(() => {
    if (!fastCacheReady || !place || !todaySchedule || !todayContext || todayContext.date !== today) return
    writeFastScheduleSnapshot({
      appVersion, now: services.now(), deviceTimeZone, context: todayContext, schedule: todaySchedule, generation: fastGeneration,
      place, selectionSource: placeSelectionSource, preferences, meta,
      ...(todayContext.source === 'official' && todayContextReady ? {
        neighbors: todaySchedules.filter((row): row is import('./domain/types').PrayerDay => !('entries' in row) && row.date !== today),
      } : {}),
    })
  }, [appVersion, fastCacheReady, fastGeneration, meta, place, placeSelectionSource, preferences,
    deviceTimeZone, services, today, todayContext, todaySchedule, todayContextReady, todaySchedules])
  const activeScheduleContext = selectedDate === today ? context : currentSchedules.context
  const activeFastingEvents = useMemo(() => selectedDate === today
    ? fastingEvents
    : buildFastingScheduleEvents(currentSchedules.schedules, currentSchedules.context?.timeZone),
  [selectedDate, today, fastingEvents, currentSchedules.schedules, currentSchedules.context?.timeZone])
  const activeRamadanOccurrence = resolveActiveRamadanOccurrence({
    today, correction: calendarPreferences.correction, hijriSupported,
    now: currentTime, timeZone: activeScheduleContext?.timeZone, events: activeFastingEvents,
    officialHorizon: selectedDate === today ? officialHorizon : currentSchedules.officialHorizon,
  })
  const fastingModeEnabled = isFastingModeActive(fastingMode, activeRamadanOccurrence)

  const openLocationDialog = useCallback(() => {
    openScreen('location')
  }, [openScreen])

  const openSettingsDialog = useCallback(() => { openScreen('settings') }, [openScreen])
  const openReligiousEvent = useCallback((religiousEventId: import('./domain/religiousEvents').ReligiousEventId) => {
    setReligiousEventLoadError(null)
    void openScreenPrepared({ screen: 'religious-event', religiousEventId }, async () => {
      const module = await loadReligiousEventScreen()
      flushSync(() => setReligiousEventScreen(() => module.ReligiousEventScreen))
    }).catch(() => {
      setReligiousEventLoadError(t('eventUnavailable'))
    })
  }, [openScreenPrepared, t])

  if (error) {
    return (
      <AppShell>
        <Screen label={t('eventLoadError')} contentClassName="screen-center">
          <p role="alert">{t('appLoadError')}</p>
          <ActionButton onClick={() => setRetryCount((count) => count + 1)}>
            {t('retryAgain')}
          </ActionButton>
        </Screen>
      </AppShell>
    )
  }

  const updatePreferences = (next: SourcePreferences) => {
    selectionSyncToken.current += 1
    setRemoteSelectionPending(false)
    setSelectionSyncError(false)
    pendingFastIdentityWrite.current = true
    setFastCacheReady(false)
    invalidateFastCache()
    editedPreferences.current = true
    setPreferences(next)
    persistence.save({ sourcePreferences: next })
  }
  const updateCalendarPreferences = (next: CalendarPreferences) => {
    editedCalendar.current = true
    setCalendarPreferences(next)
    persistence.save({ calendarPreferences: next })
  }
  const updateThemeFamily = (next: ThemeFamily) => {
    themePreferenceRevision.current += 1
    lastRemoteThemeFamily.current = null
    editedTheme.current = true
    setThemeFamily(next)
    setThemeEditedLocally(true)
    persistence.save({ themeFamily: next })
  }
  const updateFastingMode = (enabled: boolean) => {
    editedFasting.current = true
    const next = updateFastingModePreferences(fastingMode, enabled, activeRamadanOccurrence)
    setFastingMode(next)
    saveSettings({ fastingMode: next })
  }
  const homeLocationLabel = homePlaceLabel(place, t('locationUnknown'))
  const sourcePlaceLabel = compactPlaceLabel(place?.name || t('selectPlace'), locale)
  const locationTime = place && getUtcOffset(currentTime, place.timeZone) !== getUtcOffset(currentTime, deviceTimeZone)
    ? getZonedTime(currentTime, place.timeZone)
    : undefined
  const dialogOpen = locationDialogOpen
    || settingsDialogOpen
    || methodologyDialogOpen
    || shareDialogOpen
    || navigation.screen === 'source-info'
    || navigation.screen === 'religious-events'
    || navigation.screen === 'religious-event'
    || navigation.screen === 'date'

  const persistenceNotice = persistence.status === 'failed' ? (
        <div className="screen-status" role="status">
          <span>{t('saveFailed')}</span>
          <ActionButton onClick={persistence.retry}>{t('retry')}</ActionButton>
        </div>
      ) : null
  const nearbyCityNotice = place?.selection === 'gps' ? nameLookupMessage(nameLookupState, locale) : null
  const recoveryNotices = <>
    {screenLoadFailed ? <div className="screen-status" role="alert">
      <span>{t('screenLoadFailed')}</span>
      <ActionButton onClick={() => window.location.reload()}>{t('retry')}</ActionButton>
    </div> : null}
    {startupRecoveryError ? <div className="screen-status" role="alert">
      <span>{t('startupRecoveryError')}</span>
      <ActionButton onClick={() => setRetryCount(count => count + 1)}>{t('retry')}</ActionButton>
    </div> : null}
    {optionalSettingsError ? <div className="screen-status" role="alert">
      <span>{t('optionalSettingsRecoveryError')}</span>
      <ActionButton onClick={() => setRetryCount(count => count + 1)}>{t('retry')}</ActionButton>
    </div> : null}
    {selectionSyncError ? <div className="screen-status" role="alert">
      <span>{t('selectionSyncFailed')}</span>
      <ActionButton onClick={() => retrySelectionSync.current()}>{t('retry')}</ActionButton>
    </div> : null}
  </>

  return (
    <AppShell>
      {!dialogOpen ? <div
        className="app-background screen-background"
      >
          {!place ? <LocationScreen initial place={gpsPreview} activePlace={place} recentPlaces={recentPlaces} onSelectRecent={selectRecent}
            onBack={backScreen} onSearch={() => { cancelInteractiveGps(); flushSync(() => openScreen('search')); document.querySelector<HTMLInputElement>('input[type="search"]')?.focus() }} onLocate={locateAutomatically}
            gpsState={gpsState} nameLookupState={nameLookupState} onAcceptGps={acceptGps}
            notice={<>{persistenceNotice}{recoveryNotices}</>} bottom={<ScreenFooter align="end"><ActionButton variant="auxiliary" id="home-settings" onClick={openSettingsDialog}>{t('settings')}</ActionButton></ScreenFooter>} /> : <ScheduleContent
            schedule={remoteSelectionPending ? null : schedule}
            schedules={remoteSelectionPending ? [] : schedules}
            scheduleLoading={scheduleLoading || (remoteSelectionPending && !selectionSyncError)}
            scheduleError={remoteSelectionPending ? null : scheduleError}
            contextReady={contextReady && !remoteSelectionPending} officialHorizon={officialHorizon}
            enrichmentError={enrichmentError && !remoteSelectionPending}
            onRetryEnrichment={() => { retryEnrichment(); if (officialMode) void services.refresh() }}
            selectedDate={selectedDate}
            calendarPreferences={calendarPreferences}
            today={today}
            currentTime={currentTime}
            now={services.now}
            officialMode={officialMode}
            hijriSupported={hijriSupported}
            fastingMode={fastingMode}
            fastingModeEnabled={fastingModeEnabled}
            fastingEvents={fastingEvents}
            timeZone={context?.timeZone}
            onSystemClockChange={syncCurrentTime}
            onOpenReligiousEvent={openReligiousEvent}
            top={<AppHeader locationButtonRef={locationButtonRef} locationLabel={homeLocationLabel} locationTime={locationTime} selectedDate={selectedDate}
              calendarPreferences={calendarPreferences} onOpenLocation={openLocationDialog} onOpenDate={() => openScreen('date')} />}
            actions={<IconActionButton id="home-settings" ref={settingsButtonRef} label={t('settings')} title={t('settings')} onClick={openSettingsDialog}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 3.75 19.15 7.9v8.2L12 20.25 4.85 16.1V7.9L12 3.75Z" stroke="currentColor" strokeWidth="1.55" strokeLinejoin="round" />
                <circle cx="12" cy="12" r="1.6" fill="currentColor" />
              </svg>
            </IconActionButton>}
            notice={<>{religiousEventLoadError ? <p role="alert">{religiousEventLoadError}</p> : null}
              {locationNotice ? <p className="note" role="status">{locationNotice}</p> : null}
              {!locationNotice && nearbyCityNotice ? <p className="note" role="status">{nearbyCityNotice}</p> : null}{persistenceNotice}{recoveryNotices}</>}
            onChangeDate={changeScheduleDate}
            onRetrySchedule={() => { retrySchedule(); if (officialMode) void services.refresh() }}
          />}

      </div> : null}

      {navigation.screen === 'date' ? <DateScreen selectedDate={selectedDate} today={today} preferences={calendarPreferences} hijriSupported={hijriSupported}
        onDateChange={changeScheduleDate} onPreferencesChange={updateCalendarPreferences} onOpenReligiousEvents={() => openScreen('religious-events')}
        onBack={backScreen} notice={persistenceNotice} /> : null}

      {navigation.screen === 'religious-events' ? <ReligiousEventsScreen today={today} correction={calendarPreferences.correction}
        hijriSupported={hijriSupported} onOpenEvent={openReligiousEvent} onBack={backScreen} loadError={religiousEventLoadError} /> : null}

      {navigation.screen === 'location' ? <LocationScreen place={gpsPreview ?? place} activePlace={place} recentPlaces={recentPlaces} {...(activeHistoryId ? { activeHistoryId } : {})} onSelectRecent={selectRecent}
        onBack={closeLocationDialog} onSearch={() => { cancelInteractiveGps(); flushSync(() => openScreen('search')); document.querySelector<HTMLInputElement>('input[type="search"]')?.focus() }} onLocate={locateAutomatically}
        onAcceptGps={acceptGps} gpsState={gpsState} nameLookupState={nameLookupState} currentTime={currentTime} notice={persistenceNotice} /> : null}
      {navigation.screen === 'search' ? <SearchScreen locations={locations} catalogStatus={cityCatalogStatus} onLoadCities={loadCities}
        onSearchCities={services.cities.search} onBack={backScreen} onSelectCity={selectPresetCity} onSelectOfficial={selectOfficialLocation} notice={persistenceNotice} /> : null}
      {navigation.screen === 'source-info' ? schedule && context
        ? SourceInfo ? <SourceInfo open onClose={backScreen} context={context} schedule={schedule} meta={meta} placeLabel={sourcePlaceLabel}
            checkedAt={repositoryState.checkedAt} updateFailed={repositoryState.update.status === 'failed'} onOpenMethodology={() => openScreen('methodology')} /> : null
        : <Screen label={t('scheduleInfo')} top={<BackButton onClick={backScreen} />}><p className="screen-copy">{place ? t('scheduleForDate') : t('noSchedulePlace')}</p></Screen>
        : null}
      {navigation.screen === 'religious-event' && navigation.religiousEventId
        ? LoadedReligiousEventScreen ? <LoadedReligiousEventScreen eventId={navigation.religiousEventId} onBack={backScreen} /> : null
        : null}
      {settingsDialogOpen && SettingsScreens ? <SettingsScreens screen={navigation.screen} preferences={preferences} onChange={updatePreferences}
        fastingModeEnabled={fastingModeEnabled} onFastingModeChange={updateFastingMode}
        themeFamily={themeFamily} onThemeFamilyChange={updateThemeFamily}
        onOpen={openScreen} onBack={backScreen} getCapability={services.getCalculationProfileCapability} onReset={resetWithFastCache} version={version} notice={persistenceNotice}
        sourceLabel={officialMode ? t('dumRt') : t(PROFILE_LABEL_KEYS[calculationSettings.profile])}
        effectiveSource={resolution}
        initialManualCalculation={place ? initialManualCalculation(place, selectedDate, datasets, capabilities) : undefined} /> : null}
      {MethodologyDialog ? <MethodologyDialog open={methodologyDialogOpen} officialScheduleUrl={meta?.source.url ?? PRAYER_PROVIDERS[0]?.bundled.source.url ?? ''} onClose={backScreen} /> : null}
      <ShareDialog open={shareDialogOpen} onClose={backScreen} />
    </AppShell>
  )
}
