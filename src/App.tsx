import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
} from 'react'

import { loadCityDataset } from './data/cityRepository'
import { prayerRepository } from './data/prayerRepository'
import { resolvePlaceName } from './data/reverseGeocoder'
import {
  addDays,
  formatCompactDateLabel,
  formatDateLabel,
  getSystemDate,
} from './domain/date'
import { findNearestLocation } from './domain/location'
import {
  findNearestCity,
  formatCityLabel,
  getCountryGroups,
  getCountryName,
  groupCitiesByCountry,
  searchCities,
  type City,
  type CityDataset,
} from './domain/cities'
import { findCurrentPrayer, findNextPrayer, formatRemainingTime } from './domain/nextPrayer'
import {
  CALCULATION_PROFILES,
  DEFAULT_CALCULATION_SETTINGS,
  calculatePrayerSchedule,
  type CalculationProfileId,
  type CalculationSettings,
  type CalculatedPrayerSchedule,
  type HighLatitudeMethod,
} from './domain/prayerCalculation'
import type {
  CalculatedPrayerKey,
  PrayerDay,
  PrayerKey,
  PrayerLocation,
  SavedCoordinates,
  SchedulePrayerKey,
} from './domain/types'
import {
  getCurrentPosition,
  getGeolocationPermission,
  pulseHaptic,
  type Coordinates,
  type GeolocationPermission,
  type PositionAccuracy,
} from './platform/browser'
import type { DatasetMeta, LocationMode } from './storage/database'
import {
  CheckIcon,
  ChevronIcon,
  ClockIcon,
  CloseIcon,
  CompassIcon,
  LocationIcon,
  MoonIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
  SunriseIcon,
  SunsetIcon,
} from './ui/Icons'

interface InitializedAppState {
  meta: DatasetMeta
  locationId: string
  locationMode: LocationMode
  calculatedLocation: SavedCoordinates | null
  calculationSettings: CalculationSettings
  cityDataset: CityDataset
}

export interface AppServices {
  initialize: () => Promise<InitializedAppState>
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
  initialize: async () => {
    const [state, cityDataset] = await Promise.all([
      prayerRepository.initialize(),
      loadCityDataset(),
    ])
    return { ...state, cityDataset }
  },
  resolvePlaceName,
  getPermission: getGeolocationPermission,
  getPosition: getCurrentPosition,
  now: () => new Date(),
}

const MAX_AUTOMATIC_DISTANCE_KM = 80
const MAX_OFFLINE_CITY_DISTANCE_KM = 30

type DisplaySchedule = PrayerDay | CalculatedPrayerSchedule
type ScheduleIconKind = 'moon' | 'sunrise' | 'sun' | 'sunset'

const OFFICIAL_PRAYER_ROWS: ReadonlyArray<{
  key: PrayerKey
  label: string
  icon: ScheduleIconKind
}> = [
  { key: 'suhurEnd', label: 'Завершение сухура', icon: 'moon' },
  { key: 'fajrJamaat', label: 'Утренний намаз в мечетях', icon: 'sunrise' },
  { key: 'sunrise', label: 'Восход', icon: 'sunrise' },
  { key: 'zenith', label: 'Зенит', icon: 'sun' },
  { key: 'dhuhr', label: 'Зухр', icon: 'sun' },
  { key: 'asr', label: 'Аср', icon: 'sunset' },
  { key: 'maghrib', label: 'Магриб', icon: 'sunset' },
  { key: 'isha', label: 'Иша', icon: 'moon' },
]

const CALCULATED_PRAYER_ROWS: ReadonlyArray<{
  key: CalculatedPrayerKey
  label: string
  icon: ScheduleIconKind
}> = [
  { key: 'fajr', label: 'Фаджр', icon: 'moon' },
  { key: 'sunrise', label: 'Восход', icon: 'sunrise' },
  { key: 'zenith', label: 'Зенит', icon: 'sun' },
  { key: 'dhuhr', label: 'Зухр', icon: 'sun' },
  { key: 'asr', label: 'Аср', icon: 'sunset' },
  { key: 'maghrib', label: 'Магриб', icon: 'sunset' },
  { key: 'isha', label: 'Иша', icon: 'moon' },
]

function ScheduleIcon({ kind }: { kind: ScheduleIconKind }) {
  const props = { className: 'schedule-icon' }
  if (kind === 'moon') return <MoonIcon {...props} />
  if (kind === 'sun') return <SunIcon {...props} />
  if (kind === 'sunset') return <SunsetIcon {...props} />
  return <SunriseIcon {...props} />
}

function PrayerSchedule({
  schedule,
  activePrayer,
}: {
  schedule: DisplaySchedule
  activePrayer: SchedulePrayerKey | undefined
}) {
  const calculated = 'entries' in schedule
  const rows = calculated ? CALCULATED_PRAYER_ROWS : OFFICIAL_PRAYER_ROWS

  return (
    <ol className="prayer-list" aria-label="Времена намаза">
      {rows.map(({ key, label, icon }) => {
        const entry = calculated
          ? (schedule as CalculatedPrayerSchedule).entries[key as CalculatedPrayerKey]
          : null
        const time = entry?.time ?? (schedule as PrayerDay)[key as PrayerKey]
        const dateTime = entry
          ? new Date(entry.instant).toISOString()
          : `${schedule.date}T${time}:00+03:00`
        const estimated = entry?.estimated ?? false

        return (
          <li
            className="prayer-row"
            data-active={key === activePrayer || undefined}
            data-estimated={estimated || undefined}
            key={key}
          >
            <ScheduleIcon kind={icon} />
            <span className="prayer-name">{label}</span>
            <span className="prayer-dots" aria-hidden="true" />
            <time className="prayer-time" dateTime={dateTime}>
              {time}
            </time>
            {estimated ? (
              <span className="estimated-mark" aria-label="Время определено по северному правилу">
                ≈
              </span>
            ) : key === activePrayer ? (
              <span className="active-mark" aria-label="Текущий намаз">
                ✦
              </span>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

function useModalDialog(
  open: boolean,
  onClose: () => void,
  initialFocusRef?: RefObject<HTMLElement | null>,
) {
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => initialFocusRef?.current?.focus())

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (element) =>
          element.tagName === 'SUMMARY' || !element.closest('details:not([open])'),
      )
      const firstElement = focusableElements[0]
      const lastElement = focusableElements.at(-1)
      if (!firstElement || !lastElement) return

      const moveFocus = (element: HTMLElement) => {
        event.preventDefault()
        requestAnimationFrame(() => element.focus())
      }
      if (!dialogRef.current.contains(document.activeElement)) {
        moveFocus(event.shiftKey ? lastElement : firstElement)
      } else if (event.shiftKey && document.activeElement === firstElement) {
        moveFocus(lastElement)
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        moveFocus(firstElement)
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [initialFocusRef, onClose, open])

  return dialogRef
}

function useDialogViewport(open: boolean) {
  const layerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !layerRef.current || !window.visualViewport) return
    const layer = layerRef.current
    const viewport = window.visualViewport
    const syncViewport = () => {
      layer.style.setProperty('--dialog-viewport-height', `${viewport.height}px`)
      layer.style.setProperty('--dialog-viewport-top', `${viewport.offsetTop}px`)
    }

    syncViewport()
    viewport.addEventListener('resize', syncViewport)
    viewport.addEventListener('scroll', syncViewport)
    return () => {
      viewport.removeEventListener('resize', syncViewport)
      viewport.removeEventListener('scroll', syncViewport)
    }
  }, [open])

  return layerRef
}

interface LocationDialogProps {
  locations: PrayerLocation[]
  cityDataset: CityDataset
  selectedOfficialId: string | null
  selectedCityId: number | null
  calculatedLocation: SavedCoordinates | null
  open: boolean
  onClose: () => void
  onSelectOfficial: (locationId: string) => void
  onSelectCity: (city: City) => void
  onLocate: () => Promise<void>
  onReverse: () => Promise<void>
}

function LocationDialog({
  locations,
  cityDataset,
  selectedOfficialId,
  selectedCityId,
  calculatedLocation,
  open,
  onClose,
  onSelectOfficial,
  onSelectCity,
  onLocate,
  onReverse,
}: LocationDialogProps) {
  const [search, setSearch] = useState('')
  const [locating, setLocating] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const dialogRef = useModalDialog(open, onClose, searchRef)
  const layerRef = useDialogViewport(open)
  const deferredSearch = useDeferredValue(search)
  const countryGroups = useMemo(
    () => getCountryGroups(cityDataset),
    [cityDataset],
  )

  useEffect(() => {
    if (!open) return
    setSearch('')
    setLocationError(null)
  }, [open])

  const filteredOfficialLocations = useMemo(() => {
    const query = deferredSearch.trim().toLocaleLowerCase('ru-RU')
    return query
      ? locations.filter(({ name }) => name.toLocaleLowerCase('ru-RU').includes(query))
      : locations
  }, [deferredSearch, locations])
  const cityMatches = useMemo(
    () => searchCities(cityDataset, deferredSearch),
    [cityDataset, deferredSearch],
  )
  const searchCountryGroups = useMemo(
    () => groupCitiesByCountry(cityMatches),
    [cityMatches],
  )
  const hasSearch = deferredSearch.trim().length > 0

  if (!open) return null

  const runLocationAction = async (
    action: () => Promise<void>,
    setPending: (pending: boolean) => void,
  ) => {
    setPending(true)
    setLocationError(null)
    try {
      await action()
    } catch (error) {
      setLocationError(
        error instanceof Error ? error.message : 'Не удалось определить местоположение',
      )
    } finally {
      setPending(false)
    }
  }

  const renderOfficialOption = (location: PrayerLocation) => (
    <li key={location.id}>
      <button
        className="location-option"
        aria-current={location.id === selectedOfficialId ? 'location' : undefined}
        type="button"
        onClick={() => onSelectOfficial(location.id)}
      >
        <span>{location.name}</span>
        {location.id === selectedOfficialId ? <CheckIcon /> : null}
      </button>
    </li>
  )

  const renderCityOption = (city: City, showCountry: boolean) => (
    <li key={city.id}>
      <button
        className="location-option city-option"
        aria-label={formatCityLabel(city)}
        aria-current={city.id === selectedCityId ? 'location' : undefined}
        type="button"
        onClick={() => onSelectCity(city)}
      >
        <span>
          {city.name}
          {showCountry ? <small>{getCountryName(city.countryCode)}</small> : null}
        </span>
        {city.id === selectedCityId ? <CheckIcon /> : null}
      </button>
    </li>
  )

  return (
    <div ref={layerRef} className="dialog-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section
        ref={dialogRef}
        aria-labelledby="location-dialog-title"
        aria-modal="true"
        className="location-dialog"
        role="dialog"
      >
        <div className="dialog-handle" aria-hidden="true" />
        <header className="dialog-header">
          <h2 id="location-dialog-title">Выбор местоположения</h2>
          <button className="icon-button" type="button" aria-label="Закрыть" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        <p className="location-mode-guide">
          <strong>В Татарстане</strong> — готовое расписание ДУМ РТ.{' '}
          <strong>В других регионах</strong> — расчёт по вашим настройкам.
        </p>

        <div className="location-actions">
          <button
            className="auto-location-button"
            type="button"
            onClick={() => void runLocationAction(onLocate, setLocating)}
            disabled={locating || resolving}
          >
            <CompassIcon />
            <span>{locating ? 'Определяем…' : 'Определить автоматически'}</span>
          </button>

          {calculatedLocation ? (
            <button
              className="reverse-location-button"
              type="button"
              onClick={() => void runLocationAction(onReverse, setResolving)}
              disabled={
                locating ||
                resolving ||
                calculatedLocation.nameSource === 'nominatim'
              }
            >
              {resolving
                ? 'Уточняем…'
                : calculatedLocation.nameSource === 'nominatim'
                  ? 'Название уточнено онлайн'
                  : 'Уточнить название онлайн'}
            </button>
          ) : null}
          {locationError ? <p className="location-error" role="alert">{locationError}</p> : null}
        </div>

        <label className="search-control">
          <SearchIcon />
          <span className="sr-only">Поиск населённого пункта</span>
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Найти город или район"
          />
        </label>

        <div className="location-results">
          {hasSearch ? (
            <>
              {filteredOfficialLocations.length > 0 ? (
                <section className="location-section" aria-labelledby="official-search-title">
                  <h3 id="official-search-title">Татарстан · официальное расписание</h3>
                  <details className="country-group official-country-group" open>
                    <summary>
                      <span>Татарстан</span>
                      <small>Официальное расписание</small>
                    </summary>
                    <ul className="location-list">{filteredOfficialLocations.map(renderOfficialOption)}</ul>
                  </details>
                </section>
              ) : null}
              {cityMatches.length > 0 ? (
                <section className="location-section" aria-labelledby="city-search-title">
                  <h3 id="city-search-title">Города мира · автономный расчёт</h3>
                  <div className="country-list">
                    {searchCountryGroups.map((group) => (
                      <details className="country-group" key={group.code} open>
                        <summary>
                          <span>{group.name}</span>
                          <small>Городов: {group.cities.length}</small>
                        </summary>
                        <ul className="location-list">
                          {group.cities.map((city) => renderCityOption(city, false))}
                        </ul>
                      </details>
                    ))}
                  </div>
                </section>
              ) : null}
              {filteredOfficialLocations.length === 0 && cityMatches.length === 0 ? (
                <p className="empty-search">Ничего не нашли. Попробуйте другое название.</p>
              ) : null}
            </>
          ) : (
            <>
              <p className="country-list-title">Регионы и страны</p>
              <div className="country-list">
                <details className="country-group official-country-group">
                  <summary>
                    <span>Татарстан</span>
                    <small>Официальное расписание</small>
                  </summary>
                  <ul className="location-list">{locations.map(renderOfficialOption)}</ul>
                </details>
                {countryGroups.map((group) => (
                  <details className="country-group" key={group.code}>
                    <summary>
                      <span>{group.name}</span>
                      <small>Городов: {group.cities.length}</small>
                    </summary>
                    <ul className="location-list">
                      {group.cities.map((city) => renderCityOption(city, false))}
                    </ul>
                  </details>
                ))}
              </div>
            </>
          )}
        </div>

        <p className="location-attribution">
          Города: <a href={cityDataset.source.url} target="_blank" rel="noreferrer">GeoNames</a>{' '}
          (<a href={cityDataset.source.licenseUrl} target="_blank" rel="noreferrer">CC BY 4.0</a>) · онлайн:{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>
        </p>
      </section>
    </div>
  )
}

interface SettingsDialogProps {
  open: boolean
  officialMode: boolean
  settings: CalculationSettings
  onClose: () => void
  onChange: (settings: CalculationSettings) => void
}

function SettingsDialog({ open, officialMode, settings, onClose, onChange }: SettingsDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useModalDialog(open, onClose, closeRef)
  const layerRef = useDialogViewport(open)
  if (!open) return null

  const update = <Key extends keyof CalculationSettings>(
    key: Key,
    value: CalculationSettings[Key],
  ) => onChange({ ...settings, [key]: value })

  return (
    <div ref={layerRef} className="dialog-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section
        ref={dialogRef}
        aria-labelledby="settings-dialog-title"
        aria-modal="true"
        className="location-dialog settings-dialog"
        role="dialog"
      >
        <div className="dialog-handle" aria-hidden="true" />
        <header className="dialog-header">
          <h2 id="settings-dialog-title">Настройки расчёта</h2>
          <button ref={closeRef} className="icon-button" type="button" aria-label="Закрыть" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        <p className="settings-mode-note" data-active={!officialMode || undefined}>
          {officialMode
            ? 'Сейчас используется готовое расписание ДУМ РТ. Эти параметры сохранятся и применятся после выбора города вне Татарстана.'
            : 'Сейчас расписание пересчитывается по этим параметрам. Изменения применяются сразу.'}
        </p>

        <label className="setting-field">
          <span>Аср</span>
          <select
            aria-label="Аср"
            value={settings.asrMethod}
            onChange={(event) => update('asrMethod', event.target.value as CalculationSettings['asrMethod'])}
          >
            <option value="hanafi">Ханафитский</option>
            <option value="standard">Стандартный</option>
          </select>
        </label>

        <label className="setting-field">
          <span>Профиль</span>
          <select
            aria-label="Профиль"
            value={settings.profile}
            onChange={(event) => update('profile', event.target.value as CalculationProfileId)}
          >
            {CALCULATION_PROFILES.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.label}</option>
            ))}
          </select>
        </label>

        <label className="setting-field">
          <span>Северные правила</span>
          <select
            aria-label="Северные правила"
            value={settings.highLatitudeRule}
            onChange={(event) => update('highLatitudeRule', event.target.value as HighLatitudeMethod)}
          >
            <option value="dumRt">ДУМ РТ · 120/90 мин</option>
            <option value="seventhOfNight">1/7 ночи</option>
            <option value="twilightAngle">Доля ночи по углу</option>
            <option value="nearestDay">Ближайший день</option>
          </select>
        </label>

      </section>
    </div>
  )
}

function LoadingScreen() {
  return (
    <main className="page-shell loading-page">
      <section className="app-frame" aria-busy="true">
        <h1 className="brand">Salah</h1>
        <div className="loading-mark" aria-hidden="true" />
        <p>Открываем расписание…</p>
      </section>
    </main>
  )
}

function calculationProfileLabel(profileId: CalculationProfileId): string {
  return CALCULATION_PROFILES.find(({ id }) => id === profileId)?.label ?? 'ДУМ РТ'
}

export function App({ services = defaultServices }: { services?: AppServices }) {
  const [meta, setMeta] = useState<DatasetMeta | null>(null)
  const [cityDataset, setCityDataset] = useState<CityDataset | null>(null)
  const [locationId, setLocationId] = useState('kazan')
  const [locationMode, setLocationMode] = useState<LocationMode>('official')
  const [calculatedLocation, setCalculatedLocation] = useState<SavedCoordinates | null>(null)
  const [calculationSettings, setCalculationSettings] = useState<CalculationSettings>(DEFAULT_CALCULATION_SETTINGS)
  const [selectedDate, setSelectedDate] = useState(() => getSystemDate(services.now()))
  const [currentTime, setCurrentTime] = useState(() => services.now())
  const [schedule, setSchedule] = useState<DisplaySchedule | null>(null)
  const [previousSchedule, setPreviousSchedule] = useState<DisplaySchedule | undefined>()
  const [tomorrow, setTomorrow] = useState<DisplaySchedule | undefined>()
  const [loading, setLoading] = useState(true)
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [scheduleRetryCount, setScheduleRetryCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [locationDialogOpen, setLocationDialogOpen] = useState(false)
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const automaticLocationAttempted = useRef(false)
  const locationButtonRef = useRef<HTMLButtonElement>(null)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)

  const closeLocationDialog = useCallback(() => {
    setLocationDialogOpen(false)
    requestAnimationFrame(() => locationButtonRef.current?.focus())
  }, [])
  const closeSettingsDialog = useCallback(() => {
    setSettingsDialogOpen(false)
    requestAnimationFrame(() => settingsButtonRef.current?.focus())
  }, [])

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
      setCityDataset(state.cityDataset)
    }).catch(() => active && setError('Не удалось открыть расписание. Проверьте соединение и попробуйте ещё раз.'))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [retryCount, services])

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(services.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [services])

  useEffect(() => {
    if (!meta) return
    let active = true
    setScheduleLoading(true)
    setScheduleError(null)

    const loadSchedules = async (): Promise<[
      DisplaySchedule | undefined,
      DisplaySchedule | null,
      DisplaySchedule | undefined,
    ]> => {
      if (locationMode === 'calculated' && calculatedLocation) {
        return [
          calculatePrayerSchedule(calculatedLocation, addDays(selectedDate, -1), calculationSettings),
          calculatePrayerSchedule(calculatedLocation, selectedDate, calculationSettings),
          calculatePrayerSchedule(calculatedLocation, addDays(selectedDate, 1), calculationSettings),
        ]
      }
      const [officialPrevious, officialDay, officialTomorrow] = await Promise.all([
        services.getDay(locationId, addDays(selectedDate, -1)),
        services.getDay(locationId, selectedDate),
        services.getDay(locationId, addDays(selectedDate, 1)),
      ])
      return [officialPrevious, officialDay ?? null, officialTomorrow]
    }

    void loadSchedules().then(([loadedPrevious, loadedSchedule, loadedTomorrow]) => {
      if (!active) return
      setPreviousSchedule(loadedPrevious)
      setSchedule(loadedSchedule)
      setTomorrow(loadedTomorrow)
    }).catch(() => {
      if (!active) return
      setPreviousSchedule(undefined)
      setSchedule(null)
      setTomorrow(undefined)
      setScheduleError('Не удалось загрузить расписание. Попробуйте ещё раз.')
    }).finally(() => {
      if (active) setScheduleLoading(false)
    })
    return () => { active = false }
  }, [
    calculatedLocation,
    calculationSettings.asrMethod,
    calculationSettings.highLatitudeRule,
    calculationSettings.profile,
    locationId,
    locationMode,
    meta,
    scheduleRetryCount,
    selectedDate,
    services,
  ])

  const today = getSystemDate(currentTime)
  const selectedLocation = meta?.locations.find(({ id }) => id === locationId)
  const nextPrayer = selectedDate === today && schedule
    ? findNextPrayer(currentTime, schedule, tomorrow)
    : null
  const currentPrayer = selectedDate === today && schedule
    ? findCurrentPrayer(currentTime, schedule, previousSchedule)
    : null

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
    if (!meta || !cityDataset) return
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
    const nearestCity = findNearestCity(
      bestPosition.latitude,
      bestPosition.longitude,
      cityDataset.cities,
      MAX_OFFLINE_CITY_DISTANCE_KM,
    )
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
  }, [cityDataset, meta, selectCalculatedLocation, selectOfficialLocation, services])

  useEffect(() => {
    if (!meta || !cityDataset || automaticLocationAttempted.current) return
    automaticLocationAttempted.current = true
    void services.getPermission().then((permission) => {
      if (permission === 'granted') void locateAutomatically().catch(() => undefined)
    })
  }, [cityDataset, locateAutomatically, meta, services])

  if (loading) return <LoadingScreen />

  if (error || !meta || !cityDataset) {
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
      </main>
    )
  }

  const officialMode = locationMode === 'official'
  const minDate = officialMode ? `${meta.source.years[0]}-01-01` : undefined
  const maxDate = officialMode ? `${meta.source.years.at(-1)}-12-31` : undefined
  const changeDate = (date: string) => {
    setSelectedDate(date)
    pulseHaptic()
  }
  const onDateInput = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.value) changeDate(event.target.value)
  }
  const showDatePicker = (event: React.MouseEvent<HTMLInputElement>) => {
    try {
      event.currentTarget.showPicker()
    } catch {
      // Нативный клик остаётся резервным вариантом в браузерах без showPicker.
    }
  }
  const updateCalculationSettings = (settings: CalculationSettings) => {
    setCalculationSettings(settings)
    void services.saveCalculationSettings(settings)
  }
  const calculatedSchedule = schedule && 'entries' in schedule ? schedule : null
  const profileLabel = calculationProfileLabel(calculationSettings.profile)
  const calculatedLocationLabel = calculatedLocation?.name ?? 'Текущее местоположение'

  const selectPresetCity = (city: City) => {
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
  }

  const reverseCalculatedLocation = async () => {
    if (!calculatedLocation) return
    const name = await services.resolvePlaceName(calculatedLocation)
    const updatedLocation: SavedCoordinates = {
      ...calculatedLocation,
      name,
      nameSource: 'nominatim',
    }
    setCalculatedLocation(updatedLocation)
    await services.saveCalculatedLocation(updatedLocation)
  }

  return (
    <main className="page-shell">
      <section className="app-frame">
        <header className="app-header">
          <span className="spark spark-left" aria-hidden="true">✦</span>
          <h1 className="brand">Salah</h1>
          <span className="spark spark-right" aria-hidden="true">✧</span>

          <div className="control-row">
            <div className="location-tools">
              <button
                ref={locationButtonRef}
                className="location-control"
                type="button"
                onClick={() => setLocationDialogOpen(true)}
                aria-label={officialMode
                  ? `Населённый пункт: ${selectedLocation?.name ?? 'не выбран'}`
                  : `Местоположение: ${calculatedLocationLabel}`}
              >
                <LocationIcon />
                <span>{officialMode ? selectedLocation?.name ?? 'Выберите населённый пункт' : calculatedLocationLabel}</span>
                <ChevronIcon className="location-chevron" />
              </button>
              <button
                ref={settingsButtonRef}
                className="icon-button settings-button"
                type="button"
                aria-label="Настройки автономного расчёта"
                onClick={() => setSettingsDialogOpen(true)}
              >
                <SettingsIcon />
              </button>
            </div>

            <div className="date-controls">
              <button
                className="icon-button date-arrow"
                type="button"
                aria-label="Предыдущий день"
                disabled={Boolean(minDate && selectedDate <= minDate)}
                onClick={() => changeDate(addDays(selectedDate, -1))}
              >
                <ChevronIcon direction="left" />
              </button>

              <label className="date-picker">
                <span className="date-label-full">{formatDateLabel(selectedDate)}</span>
                <span className="date-label-compact" aria-hidden="true">{formatCompactDateLabel(selectedDate)}</span>
                <input
                  aria-label="Выбрать дату"
                  type="date"
                  min={minDate}
                  max={maxDate}
                  value={selectedDate}
                  onClick={showDatePicker}
                  onChange={onDateInput}
                />
              </label>

              <button
                className="icon-button date-arrow"
                type="button"
                aria-label="Следующий день"
                disabled={Boolean(maxDate && selectedDate >= maxDate)}
                onClick={() => changeDate(addDays(selectedDate, 1))}
              >
                <ChevronIcon />
              </button>

              {selectedDate !== today ? (
                <button className="today-button" type="button" onClick={() => changeDate(today)}>Сегодня</button>
              ) : null}
            </div>
          </div>
        </header>

        <div className="content-grid" data-loading={scheduleLoading || undefined}>
          <section className="next-prayer-panel" aria-label="Текущий намаз и время до следующего">
            {scheduleError ? (
              <div className="no-next-prayer"><ClockIcon /><p>Расписание временно недоступно</p></div>
            ) : scheduleLoading && !schedule ? (
              <div className="no-next-prayer" aria-live="polite"><ClockIcon /><p>Загружаем расписание…</p></div>
            ) : selectedDate === today ? (
              nextPrayer ? (
                <>
                  <div className="current-prayer">
                    <p className="current-label">Сейчас</p>
                    <p className="next-name">
                      {currentPrayer ? `${currentPrayer.label} · ${currentPrayer.time}` : 'До первого намаза'}
                    </p>
                  </div>
                  <div
                    className="countdown"
                    role="timer"
                    aria-live="off"
                    aria-label={`Осталось ${formatRemainingTime(nextPrayer.remainingSeconds)}`}
                  >
                    <ClockIcon />
                    <span className="countdown-copy">
                      <span className="next-label">До следующего намаза</span>
                      <span className="countdown-value">{formatRemainingTime(nextPrayer.remainingSeconds)}</span>
                    </span>
                  </div>
                </>
              ) : (
                <div className="no-next-prayer">
                  <MoonIcon />
                  <p>{officialMode ? 'Следующее расписание ещё не опубликовано' : 'Следующий намаз не найден'}</p>
                </div>
              )
            ) : (
              <div className="selected-date-summary">
                <SunIcon /><p>Расписание на</p><strong>{formatDateLabel(selectedDate)}</strong>
              </div>
            )}
          </section>

          <section className="schedule-panel" aria-busy={scheduleLoading}>
            {scheduleError ? (
              <div className="missing-schedule schedule-error">
                <p role="alert">{scheduleError}</p>
                <button className="primary-button" type="button" onClick={() => setScheduleRetryCount((count) => count + 1)}>Повторить</button>
              </div>
            ) : schedule ? (
              <PrayerSchedule schedule={schedule} activePrayer={currentPrayer?.date === schedule.date ? currentPrayer.key : undefined} />
            ) : scheduleLoading ? (
              <div className="schedule-skeleton" aria-label="Загружаем расписание" />
            ) : (
              <div className="missing-schedule">
                <p>Расписание на эту дату ещё не опубликовано.</p>
                {selectedDate !== today ? (
                  <button className="primary-button" type="button" onClick={() => changeDate(today)}>Сегодня</button>
                ) : null}
              </div>
            )}

            <div>
              {calculatedSchedule?.estimatedPrayers.some((key) => key === 'fajr' || key === 'isha') ? (
                <p className="calculation-note">Фаджр и/или Иша определены по правилу северных широт.</p>
              ) : null}
              {calculatedSchedule?.polarResolutionApplied ? (
                <p className="calculation-note">Солнечный цикл восстановлен по ближайшей подходящей широте или дню.</p>
              ) : null}
              <footer className="source-note">
                <CheckIcon />
                {officialMode ? (
                  <span>
                    Официальное расписание <a href={meta.source.url} target="_blank" rel="noreferrer">ДУМ РТ</a> · Настройки расчёта не влияют · Доступно офлайн
                  </span>
                ) : (
                  <span>Расчёт по настройкам · {profileLabel} · Аср: {calculationSettings.asrMethod === 'hanafi' ? 'ханафитский' : 'стандартный'} · Доступно офлайн</span>
                )}
                <span className="source-spark" aria-hidden="true">✦</span>
              </footer>
            </div>
          </section>
        </div>
      </section>

      <LocationDialog
        locations={meta.locations}
        cityDataset={cityDataset}
        selectedOfficialId={officialMode ? locationId : null}
        selectedCityId={officialMode ? null : calculatedLocation?.cityId ?? null}
        calculatedLocation={officialMode ? null : calculatedLocation}
        open={locationDialogOpen}
        onClose={closeLocationDialog}
        onSelectOfficial={selectOfficialLocation}
        onSelectCity={selectPresetCity}
        onLocate={locateAutomatically}
        onReverse={reverseCalculatedLocation}
      />
      <SettingsDialog
        open={settingsDialogOpen}
        officialMode={officialMode}
        settings={calculationSettings}
        onClose={closeSettingsDialog}
        onChange={updateCalculationSettings}
      />
    </main>
  )
}
