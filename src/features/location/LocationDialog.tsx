import { staticText } from '../../ui/staticText'
import type { Place } from '../../domain/place'
import {
  memo,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { flushSync } from 'react-dom'

import type { CityCatalog, CitySearchResult } from '../../data/cityCatalog'
import {
  formatCityLabel,
  formatCityRegion,
  getCountryName,
  type City,
} from '../../domain/cities'
import type { DataFailure } from '../../domain/errors'
import type { Result } from '../../domain/result'
import type { PrayerLocation } from '../../domain/types'
import {
  CheckIcon,
  CloseIcon,
  CompassIcon,
  SearchIcon,
} from '../../ui/Icons'
import { useDialogViewport, useModalDialog } from '../../ui/dialogHooks'
import type { CityCatalogStatus } from './useCityCatalog'

interface LocationDialogProps {
  persistenceNotice?: ReactNode
  locations: PrayerLocation[]
  cityCatalog: CityCatalog | null
  cityCatalogStatus: CityCatalogStatus
  selectedOfficialId: string | null
  selectedCityId: number | null
  place: Place | null
  officialLocation: PrayerLocation | null
  onTimeZoneChange: (zone: string | null) => Promise<string>
  open: boolean
  onClose: () => void
  onSelectOfficial: (locationId: string) => void
  onSelectCity: (city: City) => void
  onLocate: () => Promise<void>
  onLoadCities: () => void
  onSearchCities: (query: string) => Promise<Result<CitySearchResult, DataFailure>>
}

interface LocationResultsProps {
  locations: PrayerLocation[]
  cityCatalog: CityCatalog | null
  cityCatalogStatus: CityCatalogStatus
  cityMatches: City[]
  citySearchPending: boolean
  citySearchFailed: boolean
  searchStatus: CitySearchResult['status']
  previousVersion: boolean
  onRetrySearch: () => void
  selectedOfficialId: string | null
  selectedCityId: number | null
  query: string
  onSelectOfficial: (locationId: string) => void
  onSelectCity: (city: City) => void
  onLoadCities: () => void
}

interface CityOptionProps {
  city: City
  selected: boolean
  disambiguate?: boolean
  onSelect: (city: City) => void
}

const CityOption = memo(function CityOption({ city, selected, onSelect, disambiguate }: CityOptionProps) {
  return (
    <li>
      <button
        className="location-option city-option"
        aria-label={formatCityLabel(city, disambiguate)}
        aria-current={selected ? 'location' : undefined}
        type="button"
        onClick={() => onSelect(city)}
      >
        <span>{city.name}<small>{formatCityRegion(city)}, {getCountryName(city.countryCode)}{disambiguate ? ` · GeoNames ${city.id}` : ''}</small></span>
        {selected ? <CheckIcon /> : null}
      </button>
    </li>
  )
})

function CollapsibleCityGroup({
  group,
  selectedCityId,
  onSelectCity,
}: {
  group: CityCatalog['countryGroups'][number]
  selectedCityId: number | null
  onSelectCity: (city: City) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <details
      className="country-group"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>
        <span>{group.name}</span>
        <small>Крупные города · {group.cities.length} из {group.totalCount}</small>
      </summary>
      {expanded ? (
        <ul className="location-list">
          {group.cities.map((city) => (
            <CityOption
              city={city}
              key={city.id}
              disambiguate={group.cities.some(other => other.id !== city.id && formatCityLabel(other) === formatCityLabel(city))}
              selected={city.id === selectedCityId}
              onSelect={onSelectCity}
            />
          ))}
        </ul>
      ) : null}
    </details>
  )
}

function CityCatalogState({
  status,
  onRetry,
}: {
  status: CityCatalogStatus
  onRetry: () => void
}) {
  if (status === 'idle' || status === 'ready') return null

  if (status === 'offline') {
    return (
      <div className="city-catalog-state" role="status">
        <p>Нет сети, а каталог городов ещё не сохранён</p>
        <button className="city-catalog-retry" type="button" onClick={onRetry}>
          Повторить
        </button>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="city-catalog-state" role="status">
        <p>Города сейчас недоступны</p>
        <button className="city-catalog-retry" type="button" onClick={onRetry}>
          Повторить
        </button>
      </div>
    )
  }

  return (
    <div className="city-catalog-state" role="status">
      <span className="city-loading-mark" aria-hidden="true" />
      <p>Загружаем города</p>
    </div>
  )
}

const LocationResults = memo(function LocationResults({
  locations,
  cityCatalog,
  cityCatalogStatus,
  cityMatches,
  citySearchPending,
  citySearchFailed,
  searchStatus,
  previousVersion,
  onRetrySearch,
  selectedOfficialId,
  selectedCityId,
  query,
  onSelectOfficial,
  onSelectCity,
  onLoadCities,
}: LocationResultsProps) {
  const filteredOfficialLocations = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU')
    return normalizedQuery
      ? locations.filter(({ name }) => name.toLocaleLowerCase('ru-RU').includes(normalizedQuery))
      : locations
  }, [locations, query])
  const hasSearch = query.trim().length > 0
  const searchAnnouncement = hasSearch
    ? citySearchPending
      ? 'Ищем города…'
      : citySearchFailed
        ? 'Не удалось выполнить поиск городов.'
        : searchStatus === 'needs-download' ? 'Для полного поиска нужно загрузить данные.'
          : searchStatus === 'refine' ? 'Уточните название города.'
            : cityCatalogStatus === 'ready'
          ? `Найдено вариантов: ${filteredOfficialLocations.length + cityMatches.length}`
          : ''
    : ''

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

  return (
    <div className="location-results" aria-busy={citySearchPending}>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {searchAnnouncement}
      </p>
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
              <h3 id="city-search-title">Города мира</h3>
              <ul className="location-list">
                {cityMatches.map((city) => (
                  <CityOption
                    city={city}
                    key={city.id}
                    disambiguate={cityMatches.some(other => other.id !== city.id && formatCityLabel(other) === formatCityLabel(city))}
                    selected={city.id === selectedCityId}
                    onSelect={onSelectCity}
                  />
                ))}
              </ul>
            </section>
          ) : null}
          {citySearchPending ? (
            <div className="city-search-state" aria-hidden="true">
              <span className="city-loading-mark" />
              <p>Ищем города…</p>
            </div>
          ) : null}
          <CityCatalogState status={cityCatalogStatus} onRetry={onLoadCities} />
          {citySearchFailed ? (
            <div><p className="empty-search">Не удалось выполнить поиск городов.</p><button className="city-catalog-retry" type="button" onClick={onRetrySearch}>Повторить поиск</button></div>
          ) : null}
          {!citySearchPending && !citySearchFailed && searchStatus === 'needs-download' ? (
            <div role="status" className="city-catalog-state"><p>{staticText('location-copy-1')}</p><button className="city-catalog-retry" type="button" onClick={onRetrySearch}>Повторить поиск</button></div>
          ) : null}
          {!citySearchPending && searchStatus === 'refine' ? <p className="empty-search">{staticText('location-copy-2')}</p> : null}
          {!citySearchPending && previousVersion ? <p role="status">{staticText('location-copy-3')}</p> : null}
          {cityCatalogStatus === 'ready' &&
          !citySearchPending &&
          !citySearchFailed &&
          searchStatus === 'complete' &&
          filteredOfficialLocations.length === 0 &&
          cityMatches.length === 0 ? (
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
            {cityCatalog?.countryGroups.map((group) => (
              <CollapsibleCityGroup
                group={group}
                key={group.code}
                selectedCityId={selectedCityId}
                onSelectCity={onSelectCity}
              />
            ))}
          </div>
          <CityCatalogState status={cityCatalogStatus} onRetry={onLoadCities} />
        </>
      )}
    </div>
  )
})

type OpenLocationDialogProps = Omit<LocationDialogProps, 'open'>

export const LocationDialog = memo(function LocationDialog({ open, ...props }: LocationDialogProps) {
  return open ? <OpenLocationDialog {...props} /> : null
})

function OpenLocationDialog({
  persistenceNotice,
  locations,
  cityCatalog,
  cityCatalogStatus,
  selectedOfficialId,
  selectedCityId,
  place,
  officialLocation,
  onTimeZoneChange,
  onClose,
  onSelectOfficial,
  onSelectCity,
  onLocate,
  onLoadCities,
  onSearchCities,
}: OpenLocationDialogProps) {
  const [searchMode, setSearchMode] = useState(false)
  const [search, setSearch] = useState('')
  const [cityMatches, setCityMatches] = useState<City[]>([])
  const [completedCitySearch, setCompletedCitySearch] = useState<string | null>(null)
  const [citySearchFailed, setCitySearchFailed] = useState(false)
  const [searchStatus, setSearchStatus] = useState<CitySearchResult['status']>('complete')
  const [previousVersion, setPreviousVersion] = useState(false)
  const [retrySearch, setRetrySearch] = useState(0)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const dialogRef = useModalDialog(true, onClose, searchRef)
  const layerRef = useDialogViewport(true)
  const searchQuery = search.trim()
  const citySearchPending = Boolean(searchQuery)
    && cityCatalogStatus === 'ready'
    && completedCitySearch !== searchQuery

  useEffect(() => {
    const query = searchQuery
    if (!searchMode || !query || cityCatalogStatus !== 'ready') return

    let active = true
    const timeout = globalThis.setTimeout(() => {
      void onSearchCities(query).then((result) => {
        if (!active) return
        if (result.ok) {
          setCityMatches(result.value.cities)
          setSearchStatus(result.value.status)
          setPreviousVersion(Boolean(result.value.previousVersion))
        } else {
          setCitySearchFailed(true)
        }
        setCompletedCitySearch(query)
      }).catch(() => {
        if (!active) return
        setCitySearchFailed(true)
        setCompletedCitySearch(query)
      })
    }, 200)

    return () => {
      active = false
      globalThis.clearTimeout(timeout)
    }
  }, [cityCatalogStatus, onSearchCities, searchMode, searchQuery, retrySearch])

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

  const openSearch = () => {
    flushSync(() => setSearchMode(true))
    searchRef.current?.focus({ preventScroll: true })
    onLoadCities()
  }

  const updateSearch = (value: string) => {
    setSearch(value)
    setCityMatches([])
    setCompletedCitySearch(null)
    setCitySearchFailed(false)
    setSearchStatus('complete')
    setPreviousVersion(false)
  }

  return (
    <div
      ref={layerRef}
      className={`dialog-layer${searchMode ? ' location-search-layer' : ''}`}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        ref={dialogRef}
        aria-labelledby={searchMode ? 'location-search-title' : 'location-dialog-title'}
        aria-modal="true"
        className={`location-dialog${searchMode ? ' location-search-dialog' : ' location-choice-dialog'}`}
        role="dialog"
        tabIndex={-1}
      >
        {searchMode ? (
          <>
            <h2 id="location-search-title" className="sr-only">Поиск населённого пункта</h2>
            <div className="location-search-header">
              <label className="search-control">
                <SearchIcon />
                <span className="sr-only">Поиск населённого пункта</span>
                <input
                  ref={searchRef}
                  type="search"
                  value={search}
                  onChange={(event) => updateSearch(event.target.value)}
                  placeholder="Найти город или район"
                  autoComplete="off"
                  autoCorrect="off"
                  enterKeyHint="search"
                  spellCheck={false}
                />
              </label>
              <button className="icon-button" type="button" aria-label="Закрыть" onClick={onClose}>
                <CloseIcon />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="dialog-handle" aria-hidden="true" />
            <header className="dialog-header">
              <h2 id="location-dialog-title">Выбор местоположения</h2>
              <button className="icon-button" type="button" aria-label="Закрыть" onClick={onClose}>
                <CloseIcon />
              </button>
            </header>
        {persistenceNotice}

            <p className="location-mode-guide">Выберите место. Источник времени определяется настройками и доступным покрытием.</p>

            {place ? <PlaceDetails key={place.id} place={place} officialLocation={officialLocation} onTimeZoneChange={onTimeZoneChange} /> : null}
            <div className="location-actions">
              <button
                className="auto-location-button"
                type="button"
                onClick={() => void runLocationAction(onLocate, setLocating)}
                disabled={locating}
              >
                <CompassIcon />
                <span>{locating ? 'Определяем…' : 'Определить автоматически'}</span>
              </button>

              {locationError ? <p className="location-error" role="alert">{locationError}</p> : null}
            </div>

            <button className="search-control search-entry-button" type="button" onClick={openSearch}>
              <SearchIcon />
              <span>Найти город или район</span>
            </button>
          </>
        )}

        <LocationResults
          locations={locations}
          cityCatalog={cityCatalog}
          cityCatalogStatus={cityCatalogStatus}
          cityMatches={cityMatches}
          citySearchPending={citySearchPending}
          citySearchFailed={citySearchFailed}
          searchStatus={searchStatus}
          previousVersion={previousVersion}
          onRetrySearch={() => { updateSearch(search); setRetrySearch(n => n + 1) }}
          selectedOfficialId={selectedOfficialId}
          selectedCityId={selectedCityId}
          query={searchMode ? search : ''}
          onSelectOfficial={onSelectOfficial}
          onSelectCity={onSelectCity}
          onLoadCities={onLoadCities}
        />

        {searchMode ? null : (
          <p className="location-attribution">
            {cityCatalog ? (
              <>
                Города: <a href={cityCatalog.source.url} target="_blank" rel="noreferrer">GeoNames</a>{' '}
                (<a href={cityCatalog.source.licenseUrl} target="_blank" rel="noreferrer">CC BY 4.0</a>) ·{' '}
              </>
            ) : null}
            Локальные границы:{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>
          </p>
        )}
      </section>
    </div>
  )
}

function PlaceDetails({ place, officialLocation, onTimeZoneChange }: {
  place: Place
  officialLocation: PrayerLocation | null
  onTimeZoneChange: (zone: string | null) => Promise<string>
}) {
  const [zone, setZone] = useState(place.timeZone)
  const [error, setError] = useState<string | null>(null)
  const changeZone = async (value: string | null) => {
    try {
      setZone(await onTimeZoneChange(value))
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Неизвестная часовая зона')
    }
  }
  const sourceLabel = place.timeZoneOverride ? 'выбрана вручную'
    : place.automaticTimeZone.source === 'boundary' ? 'по локальной границе Татарстана'
      : place.automaticTimeZone.source === 'city' ? 'из данных населённого пункта'
        : place.automaticTimeZone.source === 'device' ? 'зона устройства: локальное покрытие недостаточно'
          : 'сохранённая зона: происхождение неизвестно'
  return (
    <details className="place-details">
      <summary>Сведения о месте и часовой пояс</summary>
      <p>{place.name} · {place.selection === 'gps' ? 'GPS' : 'Выбор населённого пункта'}</p>
      <p>{place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}{place.accuracy !== null ? ` · точность ±${Math.round(place.accuracy)} м` : ''}</p>
      <p>Регион: {place.region?.name || 'не подтверждён локальными данными'}</p>
      {place.nearbyCity ? <p>Ориентир: {place.nearbyCity.name} · {place.nearbyCity.distanceKm.toFixed(1)} км. Для расчёта сохранена точка GPS.</p> : null}
      {place.coverage === 'uncertain' ? <p>{staticText('location-copy-4')}</p> : null}
      {place.coverage === 'unavailable' ? <p>{staticText('location-copy-5')}</p> : null}
      <p role="status">Часовой пояс: {place.timeZone} · {sourceLabel}</p>
      <label className="timezone-label">Часовой пояс IANA
        <input value={zone} onChange={event => setZone(event.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="Europe/Moscow" />
      </label>
      <div className="timezone-actions">
        <button type="button" className="city-catalog-retry" onClick={() => void changeZone(zone.trim())}>Применить часовой пояс</button>
        <button type="button" className="city-catalog-retry" onClick={() => void changeZone(null)}>Определять часовой пояс автоматически</button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {officialLocation ? <p>Таблица ДУМ РТ опубликована для {officialLocation.name}. Её часы и календарная дата показаны в Europe/Moscow, независимо от зоны места. Ручная зона не изменяет моменты намаза.</p> : null}
      <p>{staticText('location-copy-6')}</p>
    </details>
  )
}
