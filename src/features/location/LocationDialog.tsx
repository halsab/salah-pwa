import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { flushSync } from 'react-dom'

import type { CityCatalog } from '../../data/cityCatalog'
import {
  formatCityLabel,
  groupCitiesByCountry,
  type City,
} from '../../domain/cities'
import type { DataFailure } from '../../domain/errors'
import type { Result } from '../../domain/result'
import type { PrayerLocation, SavedCoordinates } from '../../domain/types'
import {
  CheckIcon,
  CloseIcon,
  CompassIcon,
  SearchIcon,
} from '../../ui/Icons'
import { useDialogViewport, useModalDialog } from '../../ui/dialogHooks'
import type { CityCatalogStatus } from './useCityCatalog'

interface LocationDialogProps {
  locations: PrayerLocation[]
  cityCatalog: CityCatalog | null
  cityCatalogStatus: CityCatalogStatus
  selectedOfficialId: string | null
  selectedCityId: number | null
  calculatedLocation: SavedCoordinates | null
  open: boolean
  onClose: () => void
  onSelectOfficial: (locationId: string) => void
  onSelectCity: (city: City) => void
  onLocate: () => Promise<void>
  onReverse: () => Promise<void>
  onLoadCities: () => void
  onSearchCities: (query: string) => Promise<Result<City[], DataFailure>>
}

interface LocationResultsProps {
  locations: PrayerLocation[]
  cityCatalog: CityCatalog | null
  cityCatalogStatus: CityCatalogStatus
  cityMatches: City[]
  citySearchPending: boolean
  citySearchFailed: boolean
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
  onSelect: (city: City) => void
}

const CityOption = memo(function CityOption({ city, selected, onSelect }: CityOptionProps) {
  return (
    <li>
      <button
        className="location-option city-option"
        aria-label={formatCityLabel(city)}
        aria-current={selected ? 'location' : undefined}
        type="button"
        onClick={() => onSelect(city)}
      >
        <span>{city.name}</span>
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
  const searchCountryGroups = useMemo(
    () => groupCitiesByCountry(cityMatches),
    [cityMatches],
  )
  const hasSearch = query.trim().length > 0
  const searchAnnouncement = hasSearch
    ? citySearchPending
      ? 'Ищем города…'
      : citySearchFailed
        ? 'Не удалось выполнить поиск городов.'
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
              <h3 id="city-search-title">Города мира · автономный расчёт</h3>
              <div className="country-list">
                {searchCountryGroups.map((group) => (
                  <details className="country-group" key={group.code} open>
                    <summary>
                      <span>{group.name}</span>
                      <small>Городов: {group.cities.length}</small>
                    </summary>
                    <ul className="location-list">
                      {group.cities.map((city) => (
                        <CityOption
                          city={city}
                          key={city.id}
                          selected={city.id === selectedCityId}
                          onSelect={onSelectCity}
                        />
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
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
            <p className="empty-search">Не удалось выполнить поиск городов.</p>
          ) : null}
          {cityCatalogStatus === 'ready' &&
          !citySearchPending &&
          !citySearchFailed &&
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

export const LocationDialog = memo(function LocationDialog({
  locations,
  cityCatalog,
  cityCatalogStatus,
  selectedOfficialId,
  selectedCityId,
  calculatedLocation,
  open,
  onClose,
  onSelectOfficial,
  onSelectCity,
  onLocate,
  onReverse,
  onLoadCities,
  onSearchCities,
}: LocationDialogProps) {
  const [searchMode, setSearchMode] = useState(false)
  const [search, setSearch] = useState('')
  const [cityMatches, setCityMatches] = useState<City[]>([])
  const [citySearchPending, setCitySearchPending] = useState(false)
  const [citySearchFailed, setCitySearchFailed] = useState(false)
  const [locating, setLocating] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const closeDialog = useCallback(() => {
    setSearchMode(false)
    onClose()
  }, [onClose])
  const dialogRef = useModalDialog(open, closeDialog, searchRef)
  const layerRef = useDialogViewport(open)

  useEffect(() => {
    if (!open) return
    setSearchMode(false)
    setSearch('')
    setCityMatches([])
    setCitySearchPending(false)
    setCitySearchFailed(false)
    setLocationError(null)
  }, [open])

  useEffect(() => {
    const query = search.trim()
    if (!open || !searchMode || !query || cityCatalogStatus !== 'ready') {
      setCityMatches([])
      setCitySearchPending(false)
      setCitySearchFailed(false)
      return
    }

    let active = true
    setCityMatches([])
    setCitySearchPending(true)
    setCitySearchFailed(false)
    const timeout = globalThis.setTimeout(() => {
      void onSearchCities(query).then((result) => {
        if (!active) return
        if (result.ok) {
          setCityMatches(result.value)
        } else {
          setCitySearchFailed(true)
        }
      }).catch(() => {
        if (active) setCitySearchFailed(true)
      }).finally(() => {
        if (active) setCitySearchPending(false)
      })
    }, 200)

    return () => {
      active = false
      globalThis.clearTimeout(timeout)
    }
  }, [cityCatalogStatus, onSearchCities, open, search, searchMode])

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

  const openSearch = () => {
    flushSync(() => setSearchMode(true))
    searchRef.current?.focus({ preventScroll: true })
    onLoadCities()
  }

  return (
    <div
      ref={layerRef}
      className={`dialog-layer${searchMode ? ' location-search-layer' : ''}`}
      onMouseDown={(event) => event.target === event.currentTarget && closeDialog()}
    >
      <section
        ref={dialogRef}
        aria-labelledby={searchMode ? 'location-search-title' : 'location-dialog-title'}
        aria-modal="true"
        className={`location-dialog${searchMode ? ' location-search-dialog' : ''}`}
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
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Найти город или район"
                  autoComplete="off"
                  autoCorrect="off"
                  enterKeyHint="search"
                  spellCheck={false}
                />
              </label>
              <button className="icon-button" type="button" aria-label="Закрыть" onClick={closeDialog}>
                <CloseIcon />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="dialog-handle" aria-hidden="true" />
            <header className="dialog-header">
              <h2 id="location-dialog-title">Выбор местоположения</h2>
              <button className="icon-button" type="button" aria-label="Закрыть" onClick={closeDialog}>
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
            Онлайн:{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>
          </p>
        )}
      </section>
    </div>
  )
})
