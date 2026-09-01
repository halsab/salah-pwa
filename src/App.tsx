import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'

import { prayerRepository } from './data/prayerRepository'
import { addDays, formatDateLabel, getMoscowDate } from './domain/date'
import { findNearestLocation } from './domain/location'
import { findNextPrayer, formatRemainingTime } from './domain/nextPrayer'
import type { PrayerDay, PrayerKey, PrayerLocation } from './domain/types'
import {
  getCurrentPosition,
  getGeolocationPermission,
  pulseHaptic,
  type Coordinates,
  type GeolocationPermission,
} from './platform/browser'
import type { DatasetMeta } from './storage/database'
import {
  CheckIcon,
  ChevronIcon,
  ClockIcon,
  CloseIcon,
  CompassIcon,
  LocationIcon,
  MoonIcon,
  SearchIcon,
  SunIcon,
  SunriseIcon,
  SunsetIcon,
} from './ui/Icons'

export interface AppServices {
  initialize: () => Promise<{ meta: DatasetMeta; locationId: string }>
  getDay: (locationId: string, date: string) => Promise<PrayerDay | undefined>
  saveLocation: (locationId: string) => Promise<void>
  getPermission: () => Promise<GeolocationPermission>
  getPosition: () => Promise<Coordinates>
  now: () => Date
}

const defaultServices: AppServices = {
  ...prayerRepository,
  getPermission: getGeolocationPermission,
  getPosition: getCurrentPosition,
  now: () => new Date(),
}

const MAX_AUTOMATIC_DISTANCE_KM = 80

const PRAYER_ROWS: ReadonlyArray<{
  key: PrayerKey
  label: string
  icon: 'moon' | 'sunrise' | 'sun' | 'sunset'
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

function ScheduleIcon({ kind }: { kind: (typeof PRAYER_ROWS)[number]['icon'] }) {
  const props = { className: 'schedule-icon' }
  if (kind === 'moon') return <MoonIcon {...props} />
  if (kind === 'sun') return <SunIcon {...props} />
  if (kind === 'sunset') return <SunsetIcon {...props} />
  return <SunriseIcon {...props} />
}

function PrayerSchedule({ day, activePrayer }: { day: PrayerDay; activePrayer: PrayerKey | undefined }) {
  return (
    <ol className="prayer-list" aria-label="Времена намаза">
      {PRAYER_ROWS.map(({ key, label, icon }) => (
        <li className="prayer-row" data-active={key === activePrayer || undefined} key={key}>
          <ScheduleIcon kind={icon} />
          <span className="prayer-name">{label}</span>
          <span className="prayer-dots" aria-hidden="true" />
          <time className="prayer-time" dateTime={`${day.date}T${day[key]}:00+03:00`}>
            {day[key]}
          </time>
          {key === activePrayer ? (
            <span className="active-mark" aria-label="Следующий намаз">
              ✦
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  )
}

interface LocationDialogProps {
  locations: PrayerLocation[]
  selectedId: string
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

  useEffect(() => {
    if (!open) return
    setSearch('')
    setLocationError(null)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => searchRef.current?.focus())

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, open])

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
        aria-labelledby="location-dialog-title"
        aria-modal="true"
        className="location-dialog"
        role="dialog"
      >
        <div className="dialog-handle" aria-hidden="true" />
        <header className="dialog-header">
          <div>
            <p className="dialog-kicker">Расписание ДУМ РТ</p>
            <h2 id="location-dialog-title">Выбор населённого пункта</h2>
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
                data-selected={location.id === selectedId || undefined}
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

export function App({ services = defaultServices }: { services?: AppServices }) {
  const [meta, setMeta] = useState<DatasetMeta | null>(null)
  const [locationId, setLocationId] = useState('kazan')
  const [selectedDate, setSelectedDate] = useState(() => getMoscowDate(services.now()))
  const [currentTime, setCurrentTime] = useState(() => services.now())
  const [day, setDay] = useState<PrayerDay | null>(null)
  const [tomorrow, setTomorrow] = useState<PrayerDay | undefined>()
  const [loading, setLoading] = useState(true)
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [locationDialogOpen, setLocationDialogOpen] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const automaticLocationAttempted = useRef(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)

    void services
      .initialize()
      .then(({ meta: loadedMeta, locationId: loadedLocationId }) => {
        if (!active) return
        setMeta(loadedMeta)
        setLocationId(loadedLocationId)
      })
      .catch(() => active && setError('Не удалось открыть расписание. Проверьте соединение и попробуйте ещё раз.'))
      .finally(() => active && setLoading(false))

    return () => {
      active = false
    }
  }, [retryCount, services])

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(services.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [services])

  useEffect(() => {
    if (!meta) return
    let active = true
    setScheduleLoading(true)

    void Promise.all([
      services.getDay(locationId, selectedDate),
      services.getDay(locationId, addDays(selectedDate, 1)),
    ]).then(([loadedDay, loadedTomorrow]) => {
      if (!active) return
      setDay(loadedDay ?? null)
      setTomorrow(loadedTomorrow)
      setScheduleLoading(false)
    })

    return () => {
      active = false
    }
  }, [locationId, meta, selectedDate, services])

  const today = getMoscowDate(currentTime)
  const selectedLocation = meta?.locations.find(({ id }) => id === locationId)
  const nextPrayer =
    selectedDate === today && day ? findNextPrayer(currentTime, day, tomorrow) : null

  const selectLocation = useCallback(
    (nextLocationId: string) => {
      setLocationId(nextLocationId)
      setLocationDialogOpen(false)
      pulseHaptic()
      void services.saveLocation(nextLocationId)
    },
    [services],
  )

  const locateAutomatically = useCallback(async () => {
    if (!meta) return
    const position = await services.getPosition()
    const nearest = findNearestLocation(
      position.latitude,
      position.longitude,
      meta.locations,
      MAX_AUTOMATIC_DISTANCE_KM,
    )
    if (!nearest) {
      throw new Error('Вы находитесь далеко от Татарстана. Выберите населённый пункт вручную.')
    }
    selectLocation(nearest.id)
  }, [meta, selectLocation, services])

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

  const minDate = `${meta.source.year}-01-01`
  const maxDate = `${meta.source.year}-12-31`

  const changeDate = (date: string) => {
    setSelectedDate(date)
    pulseHaptic()
  }

  const onDateInput = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.value) changeDate(event.target.value)
  }

  return (
    <main className="page-shell">
      <section className="app-frame">
        <header className="app-header">
          <span className="spark spark-left" aria-hidden="true">✦</span>
          <h1 className="brand">Salah</h1>
          <span className="spark spark-right" aria-hidden="true">✧</span>

          <div className="control-row">
            <button
              className="location-control"
              type="button"
              onClick={() => setLocationDialogOpen(true)}
              aria-label={`Населённый пункт: ${selectedLocation?.name ?? 'не выбран'}`}
            >
              <LocationIcon />
              <span>{selectedLocation?.name ?? 'Выберите населённый пункт'}</span>
              <ChevronIcon className="location-chevron" />
            </button>

            <div className="date-controls">
              <button
                className="icon-button date-arrow"
                type="button"
                aria-label="Предыдущий день"
                disabled={selectedDate <= minDate}
                onClick={() => changeDate(addDays(selectedDate, -1))}
              >
                <ChevronIcon direction="left" />
              </button>

              <label className="date-picker">
                <span>{formatDateLabel(selectedDate)}</span>
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
                disabled={selectedDate >= maxDate}
                onClick={() => changeDate(addDays(selectedDate, 1))}
              >
                <ChevronIcon />
              </button>

              {selectedDate !== today ? (
                <button className="today-button" type="button" onClick={() => changeDate(today)}>
                  Сегодня
                </button>
              ) : null}
            </div>
          </div>
        </header>

        <div className="content-grid" data-loading={scheduleLoading || undefined}>
          <section className="next-prayer-panel" aria-label="Следующий намаз">
            {selectedDate === today ? (
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
                  <p>Следующее расписание ещё не опубликовано</p>
                </div>
              )
            ) : (
              <div className="selected-date-summary">
                <SunIcon />
                <p>Расписание на</p>
                <strong>{formatDateLabel(selectedDate)}</strong>
              </div>
            )}
          </section>

          <section className="schedule-panel" aria-busy={scheduleLoading}>
            {day ? (
              <PrayerSchedule
                day={day}
                activePrayer={nextPrayer?.date === day.date ? nextPrayer.key : undefined}
              />
            ) : scheduleLoading ? (
              <div className="schedule-skeleton" aria-label="Загружаем расписание" />
            ) : (
              <div className="missing-schedule">
                <p>Расписание на эту дату ещё не опубликовано.</p>
                {selectedDate !== today ? (
                  <button className="primary-button" type="button" onClick={() => changeDate(today)}>
                    Сегодня
                  </button>
                ) : null}
              </div>
            )}

            <footer className="source-note">
              <CheckIcon />
              <span>
                По данным{' '}
                <a href={meta.source.url} target="_blank" rel="noreferrer">ДУМ РТ</a>
                {' '}· Доступно офлайн
              </span>
              <span className="source-spark" aria-hidden="true">✦</span>
            </footer>
          </section>
        </div>
      </section>

      <p className="privacy-note">Координаты и выбранный город остаются на этом устройстве.</p>

      <LocationDialog
        locations={meta.locations}
        selectedId={locationId}
        open={locationDialogOpen}
        onClose={() => setLocationDialogOpen(false)}
        onSelect={selectLocation}
        onLocate={locateAutomatically}
      />
    </main>
  )
}
