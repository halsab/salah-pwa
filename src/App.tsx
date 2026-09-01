import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
} from 'react'

import { prayerRepository } from './data/prayerRepository'
import {
  addDays,
  formatCompactDateLabel,
  formatDateLabel,
  getSystemDate,
} from './domain/date'
import { findNearestLocation } from './domain/location'
import { findNextPrayer, formatRemainingTime } from './domain/nextPrayer'
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
}

export interface AppServices {
  initialize: () => Promise<InitializedAppState>
  getDay: (locationId: string, date: string) => Promise<PrayerDay | undefined>
  saveOfficialLocation: (locationId: string) => Promise<void>
  saveCalculatedLocation: (coordinates: SavedCoordinates) => Promise<void>
  saveCalculationSettings: (settings: CalculationSettings) => Promise<void>
  getPermission: () => Promise<GeolocationPermission>
  getPosition: (accuracy: PositionAccuracy) => Promise<Coordinates>
  now: () => Date
}

const defaultServices: AppServices = {
  ...prayerRepository,
  getPermission: getGeolocationPermission,
  getPosition: getCurrentPosition,
  now: () => new Date(),
}

const MAX_AUTOMATIC_DISTANCE_KM = 80

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
              <span className="active-mark" aria-label="Следующий намаз">
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
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
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

interface LocationDialogProps {
  locations: PrayerLocation[]
  selectedId: string | null
  open: boolean
  onClose: () => void
  onSelect: (locationId: string) => void
  onLocate: () => Promise<void>
}

function LocationDialog({
  locations,
  selectedId,
  open,
  onClose,
  onSelect,
  onLocate,
}: LocationDialogProps) {
  const [search, setSearch] = useState('')
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const dialogRef = useModalDialog(open, onClose, searchRef)

  useEffect(() => {
    if (!open) return
    setSearch('')
    setLocationError(null)
  }, [open])

  const filteredLocations = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ru-RU')
    return query
      ? locations.filter(({ name }) => name.toLocaleLowerCase('ru-RU').includes(query))
      : locations
  }, [locations, search])

  if (!open) return null

  const locate = async () => {
    setLocating(true)
    setLocationError(null)
    try {
      await onLocate()
    } catch (error) {
      setLocationError(
        error instanceof Error ? error.message : 'Не удалось определить местоположение',
      )
    } finally {
      setLocating(false)
    }
  }

  return (
    <div className="dialog-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section
        ref={dialogRef}
        aria-labelledby="location-dialog-title"
        aria-modal="true"
        className="location-dialog"
        role="dialog"
      >
        <div className="dialog-handle" aria-hidden="true" />
        <header className="dialog-header">
          <div>
            <p className="dialog-kicker">Официально в РТ · расчёт вне РТ</p>
            <h2 id="location-dialog-title">Выбор местоположения</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Закрыть" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        <button className="auto-location-button" type="button" onClick={() => void locate()} disabled={locating}>
          <CompassIcon />
          <span>{locating ? 'Определяем…' : 'Определить автоматически'}</span>
        </button>

        {locationError ? <p className="location-error" role="alert">{locationError}</p> : null}

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

        <ul className="location-list">
          {filteredLocations.map((location) => (
            <li key={location.id}>
              <button
                className="location-option"
                aria-current={location.id === selectedId ? 'location' : undefined}
                type="button"
                onClick={() => onSelect(location.id)}
              >
                <span>{location.name}</span>
                {location.id === selectedId ? <CheckIcon /> : null}
              </button>
            </li>
          ))}
          {filteredLocations.length === 0 ? (
            <li className="empty-search">Ничего не нашли. Попробуйте другое название.</li>
          ) : null}
        </ul>
      </section>
    </div>
  )
}

interface SettingsDialogProps {
  open: boolean
  settings: CalculationSettings
  onClose: () => void
  onChange: (settings: CalculationSettings) => void
}

function SettingsDialog({ open, settings, onClose, onChange }: SettingsDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useModalDialog(open, onClose, closeRef)
  if (!open) return null

  const update = <Key extends keyof CalculationSettings>(
    key: Key,
    value: CalculationSettings[Key],
  ) => onChange({ ...settings, [key]: value })

  return (
    <div className="dialog-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section
        ref={dialogRef}
        aria-labelledby="settings-dialog-title"
        aria-modal="true"
        className="location-dialog settings-dialog"
        role="dialog"
      >
        <div className="dialog-handle" aria-hidden="true" />
        <header className="dialog-header">
          <div>
            <p className="dialog-kicker">Автономный расчёт</p>
            <h2 id="settings-dialog-title">Настройки расчёта</h2>
          </div>
          <button ref={closeRef} className="icon-button" type="button" aria-label="Закрыть" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

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

        <p className="settings-hint">
          Настройки применяются к расчёту вне зоны официального расписания.
        </p>
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
  const [locationId, setLocationId] = useState('kazan')
  const [locationMode, setLocationMode] = useState<LocationMode>('official')
  const [calculatedLocation, setCalculatedLocation] = useState<SavedCoordinates | null>(null)
  const [calculationSettings, setCalculationSettings] = useState<CalculationSettings>(DEFAULT_CALCULATION_SETTINGS)
  const [selectedDate, setSelectedDate] = useState(() => getSystemDate(services.now()))
  const [currentTime, setCurrentTime] = useState(() => services.now())
  const [schedule, setSchedule] = useState<DisplaySchedule | null>(null)
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

    const loadSchedules = async (): Promise<[DisplaySchedule | null, DisplaySchedule | undefined]> => {
      if (locationMode === 'calculated' && calculatedLocation) {
        return [
          calculatePrayerSchedule(calculatedLocation, selectedDate, calculationSettings),
          calculatePrayerSchedule(calculatedLocation, addDays(selectedDate, 1), calculationSettings),
        ]
      }
      const [officialDay, officialTomorrow] = await Promise.all([
        services.getDay(locationId, selectedDate),
        services.getDay(locationId, addDays(selectedDate, 1)),
      ])
      return [officialDay ?? null, officialTomorrow]
    }

    void loadSchedules().then(([loadedSchedule, loadedTomorrow]) => {
      if (!active) return
      setSchedule(loadedSchedule)
      setTomorrow(loadedTomorrow)
    }).catch(() => {
      if (!active) return
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

  const selectOfficialLocation = useCallback((nextLocationId: string) => {
    setLocationId(nextLocationId)
    setLocationMode('official')
    closeLocationDialog()
    pulseHaptic()
    void services.saveOfficialLocation(nextLocationId)
  }, [closeLocationDialog, services])

  const selectCalculatedLocation = useCallback((coordinates: Coordinates) => {
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
    selectCalculatedLocation(bestPosition)
  }, [meta, selectCalculatedLocation, selectOfficialLocation, services])

  useEffect(() => {
    if (!meta || automaticLocationAttempted.current) return
    automaticLocationAttempted.current = true
    void services.getPermission().then((permission) => {
      if (permission === 'granted') void locateAutomatically().catch(() => undefined)
    })
  }, [locateAutomatically, meta, services])

  if (loading) return <LoadingScreen />

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
  const updateCalculationSettings = (settings: CalculationSettings) => {
    setCalculationSettings(settings)
    void services.saveCalculationSettings(settings)
  }
  const calculatedSchedule = schedule && 'entries' in schedule ? schedule : null
  const profileLabel = calculationProfileLabel(calculationSettings.profile)

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
                  : 'Местоположение: текущее'}
              >
                <LocationIcon />
                <span>{officialMode ? selectedLocation?.name ?? 'Выберите населённый пункт' : 'Текущее местоположение'}</span>
                <ChevronIcon className="location-chevron" />
              </button>
              <button
                ref={settingsButtonRef}
                className="icon-button settings-button"
                type="button"
                aria-label="Настройки расчёта"
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
          <section className="next-prayer-panel" aria-label="Следующий намаз">
            {scheduleError ? (
              <div className="no-next-prayer"><ClockIcon /><p>Расписание временно недоступно</p></div>
            ) : scheduleLoading && !schedule ? (
              <div className="no-next-prayer" aria-live="polite"><ClockIcon /><p>Загружаем расписание…</p></div>
            ) : selectedDate === today ? (
              nextPrayer ? (
                <>
                  <p className="next-label">До следующего намаза</p>
                  <p className="next-name">{nextPrayer.label} · {nextPrayer.time}</p>
                  <div
                    className="countdown"
                    role="timer"
                    aria-live="off"
                    aria-label={`Осталось ${formatRemainingTime(nextPrayer.remainingSeconds)}`}
                  >
                    <ClockIcon />
                    <span>{formatRemainingTime(nextPrayer.remainingSeconds)}</span>
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
              <PrayerSchedule schedule={schedule} activePrayer={nextPrayer?.date === schedule.date ? nextPrayer.key : undefined} />
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
                    По данным <a href={meta.source.url} target="_blank" rel="noreferrer">ДУМ РТ</a> · Доступно офлайн
                  </span>
                ) : (
                  <span>Рассчитано на устройстве · {profileLabel} · Доступно офлайн</span>
                )}
                <span className="source-spark" aria-hidden="true">✦</span>
              </footer>
            </div>
          </section>
        </div>
      </section>

      <p className="privacy-note">Координаты и выбранный город остаются на этом устройстве.</p>

      <LocationDialog
        locations={meta.locations}
        selectedId={officialMode ? locationId : null}
        open={locationDialogOpen}
        onClose={closeLocationDialog}
        onSelect={selectOfficialLocation}
        onLocate={locateAutomatically}
      />
      <SettingsDialog
        open={settingsDialogOpen}
        settings={calculationSettings}
        onClose={closeSettingsDialog}
        onChange={updateCalculationSettings}
      />
    </main>
  )
}
