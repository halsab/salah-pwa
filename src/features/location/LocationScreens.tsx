import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CityCatalogService, CitySearchResult } from '../../data/cityCatalog'
import { formatCityLabel, formatCityRegion, getCountryName, type City } from '../../domain/cities'
import type { Place } from '../../domain/place'
import type { PrayerLocation } from '../../domain/types'
import { BackButton, Screen } from '../../ui/Screen'
import type { CityCatalogStatus } from './useCityCatalog'

export function LocationScreen({ place, recentPlaces, onBack, onSearch, onSelectRecent, onLocate, notice, initial = false, bottom }: {
  place: Place | null; recentPlaces: Place[]; onBack: () => void; onSearch: () => void
  onSelectRecent: (place: Place) => void; onLocate: () => Promise<void>; notice?: ReactNode; initial?: boolean; bottom?: ReactNode
}) {
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const locate = async () => {
    setLocating(true); setError(null)
    try { await onLocate() }
    catch (failure) { if (active.current) setError(failure instanceof Error ? failure.message : 'Не удалось определить место') }
    finally { if (active.current) setLocating(false) }
  }
  const recent = recentPlaces.filter(item => item.id !== place?.id).slice(0, 3)
  return <Screen label={initial ? 'Выбор места' : 'Локация'} top={initial ? undefined : <BackButton onClick={onBack} />} bottom={bottom} contentClassName={initial ? 'screen-center' : ''}>
    {initial ? <h1 className="screen-title">Выберите место</h1> : null}
    {place ? <div className="location-current"><p className="screen-title">{place.name}</p>{place.region ? <p className="note">{place.region.name}</p> : null}</div> : null}
    <div className="screen-stack">
      <button id="location-search" className="pill pill-wide search-open" type="button" onClick={onSearch}>Найти город</button>
      <button className="pill pill-wide" type="button" onClick={() => void locate()} disabled={locating}>{locating ? 'Определяем место…' : 'По геопозиции'}</button>
      {error ? <p className="note" role="alert">{error}</p> : null}
    </div>
    {recent.length ? <section className="screen-space" aria-label="Недавние города"><p className="screen-heading">Недавние</p><div className="screen-stack screen-space">
      {recent.map(item => <button className="pill pill-row" key={item.id} type="button" onClick={() => onSelectRecent(item)}>{item.name}</button>)}
    </div></section> : null}
    {notice}
  </Screen>
}

interface SearchScreenProps {
  locations: PrayerLocation[]
  catalogStatus: CityCatalogStatus
  onLoadCities: () => void
  onSearchCities: CityCatalogService['search']
  onBack: () => void
  onSelectOfficial: (id: string) => void
  onSelectCity: (city: City) => void
  notice?: ReactNode
}
interface SearchCompletion { query: string; data: CitySearchResult | null; failed: boolean }

export function SearchScreen({ locations, catalogStatus, onLoadCities, onSearchCities, onBack, onSelectOfficial, onSelectCity, notice }: SearchScreenProps) {
  const [text, setText] = useState('')
  const [completion, setCompletion] = useState<SearchCompletion | null>(null)
  const [retry, setRetry] = useState(0)
  const query = text.trim()
  useEffect(() => { onLoadCities() }, [onLoadCities])
  useEffect(() => {
    if (!query || catalogStatus !== 'ready') return
    let active = true
    const timer = setTimeout(() => {
      void onSearchCities(query).then(result => {
        if (active) setCompletion({ query, data: result.ok ? result.value : null, failed: !result.ok })
      }).catch(() => { if (active) setCompletion({ query, data: null, failed: true }) })
    }, 200)
    return () => { active = false; clearTimeout(timer) }
  }, [query, catalogStatus, onSearchCities, retry])
  const official = useMemo(() => query ? locations.filter(item => item.name.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'))) : [], [locations, query])
  const ready = completion?.query === query ? completion : null
  const pending = Boolean(query && catalogStatus === 'ready' && !ready)
  const cities = ready?.data?.cities ?? []
  const retrySearch = () => { setCompletion(null); setRetry(value => value + 1); onLoadCities() }
  const status = catalogStatus === 'offline' ? 'Для поиска городов нужен интернет'
    : catalogStatus === 'error' ? 'Не удалось загрузить города'
      : catalogStatus === 'loading' || catalogStatus === 'idle' ? 'Загружаем города…'
        : pending ? 'Ищем города…'
          : ready?.failed ? 'Не удалось выполнить поиск'
            : ready?.data?.status === 'needs-download' ? 'Для полного поиска нужен интернет'
              : ready?.data?.status === 'refine' ? 'Уточните название города'
                : query && ready && !cities.length && !official.length ? 'Город не найден' : null
  const canRetry = ['offline', 'error'].includes(catalogStatus) || ready?.failed || ready?.data?.status === 'needs-download'
  return <Screen label="Поиск города" top={<BackButton onClick={onBack} label="Отмена" />}>
    <input className="text-field" data-screen-focus type="search" aria-label="Поиск населённого пункта" placeholder="Найти город" value={text}
      onChange={event => { setText(event.target.value); setCompletion(null) }} autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="search" />
    <ul className="city-results" aria-label="Результаты поиска" aria-busy={pending}>
      {official.map(item => <li key={item.id}><button className="pill city-result" type="button" onClick={() => onSelectOfficial(item.id)}>
        <span>{item.name}</span><span className="note">Татарстан · таблица ДУМ РТ</span>
      </button></li>)}
      {cities.map(city => {
        const sameLabel = cities.some(other => other.id !== city.id && formatCityLabel(other) === formatCityLabel(city))
        return <li key={city.id}><button className="pill city-result" type="button" onClick={() => onSelectCity(city)}>
          <span>{city.name}</span><span className="note">{formatCityRegion(city)}, {getCountryName(city.countryCode)}{sameLabel ? ` · ${city.id}` : ''}</span>
        </button></li>
      })}
    </ul>
    {status ? <p className="note screen-space" role="status">{status}</p> : null}
    {canRetry ? <button className="pill screen-space" type="button" onClick={retrySearch}>Повторить</button> : null}
    {ready?.data?.previousVersion ? <p className="note screen-space">Показан сохранённый каталог</p> : null}
    {notice}
  </Screen>
}
