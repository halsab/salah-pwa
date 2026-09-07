import { haversineDistanceKm } from './location'

export interface City {
  id: number
  name: string
  countryCode: string
  admin1Code: string
  admin1Name: string
  latitude: number
  longitude: number
  population: number
  timeZone: string
}

export type CompactCityRecord = [
  id: number,
  displayName: string,
  normalizedNames: string[],
  countryCode: string,
  admin1Code: string,
  latitude: number,
  longitude: number,
  population: number,
  timeZone: string,
  admin1Name: string,
  normalizedContext: string,
]

export interface CityDatasetSource {
  name: string
  url: string
  license: string
  licenseUrl: string
  updatedAt: string
}

export interface CityDataset {
  source: CityDatasetSource
  cities: CompactCityRecord[]
}

export interface CountryCityGroup {
  code: string
  name: string
  cities: City[]
  totalCount: number
}

const MAX_SEARCH_RESULTS = 60
const MAX_OVERVIEW_CITIES_PER_COUNTRY = 5
const countryNames = new Intl.DisplayNames(['ru'], { type: 'region' })
const countryCollator = new Intl.Collator('ru', { sensitivity: 'base' })

export function normalizeCitySearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('ru-RU')
    .trim()
    .replace(/\s+/g, ' ')
}

export function getCountryName(countryCode: string): string {
  try {
    return countryNames.of(countryCode) ?? countryCode
  } catch {
    return countryCode
  }
}

export function materializeCity(record: CompactCityRecord): City {
  return {
    id: record[0],
    name: record[1],
    countryCode: record[3],
    admin1Code: record[4],
    admin1Name: record[9],
    latitude: record[5],
    longitude: record[6],
    population: record[7],
    timeZone: record[8],
  }
}

export function formatCityRegion(city: City): string {
  return city.admin1Name || (city.admin1Code && city.admin1Code !== '00'
    ? `регион ${city.admin1Code}`
    : 'регион не указан')
}

export function formatCityLabel(city: City, disambiguate = false): string {
  const label = `${city.name}, ${formatCityRegion(city)}, ${getCountryName(city.countryCode)}`
  return disambiguate ? `${label} · GeoNames ${city.id}` : label
}

export function findNearestCity(
  latitude: number,
  longitude: number,
  cities: readonly CompactCityRecord[],
  maxDistanceKm: number,
): City | null {
  if (!validNearestQuery(latitude, longitude, maxDistanceKm)) return null
  let nearest: CompactCityRecord | undefined
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const city of cities) {
    const distance = haversineDistanceKm(
      latitude,
      longitude,
      city[5],
      city[6],
    )
    if (distance < nearestDistance || (distance === nearestDistance && city[0] < (nearest?.[0] ?? Infinity))) {
      nearest = city
      nearestDistance = distance
    }
  }

  return nearest && nearestDistance <= maxDistanceKm
    ? materializeCity(nearest)
    : null
}

export function searchCities(
  dataset: CityDataset,
  query: string,
  limit = MAX_SEARCH_RESULTS,
): City[] {
  const terms = normalizeCitySearch(query).split(/\s+/).filter(Boolean)
  const requestedLimit = Number.isFinite(limit)
    ? Math.floor(limit)
    : MAX_SEARCH_RESULTS
  const resultLimit = Math.min(
    Math.max(requestedLimit, 0),
    MAX_SEARCH_RESULTS,
  )
  if (terms.length === 0 || resultLimit === 0) return []

  const normalized = normalizeCitySearch(query)
  const matches: { record: CompactCityRecord; rank: number }[] = []
  for (const record of dataset.cities) {
    const names = record[2]
    const key = `${names.join(' ')} ${record[10]}`
    if (!terms.every((term) => key.includes(term))) continue
    const primary = names[0] ?? ''
    const rank = primary === normalized ? 0
      : primary.startsWith(normalized) ? 1
        : names.slice(1).some((name) => name === normalized) ? 2
          : names.slice(1).some((name) => name.startsWith(normalized)) ? 3
            : names.some((name) => terms.every((term) => name.includes(term))) ? 4 : 5
    matches.push({ record, rank })
  }
  return matches.sort((a, b) => a.rank - b.rank
    || b.record[7] - a.record[7] || a.record[0] - b.record[0])
    .slice(0, resultLimit).map(({ record }) => materializeCity(record))
}

export function validNearestQuery(latitude: number, longitude: number, maxDistanceKm: number): boolean {
  return Number.isFinite(latitude) && Math.abs(latitude) <= 90
    && Number.isFinite(longitude) && Math.abs(longitude) <= 180
    && Number.isFinite(maxDistanceKm) && maxDistanceKm >= 0
}

export function getCountryGroups(
  dataset: CityDataset,
  citiesPerCountry = MAX_OVERVIEW_CITIES_PER_COUNTRY,
): CountryCityGroup[] {
  const materializationLimit = Math.min(
    Math.max(Math.floor(citiesPerCountry), 0),
    MAX_OVERVIEW_CITIES_PER_COUNTRY,
  )
  const groups = new Map<string, CountryCityGroup>()

  for (const city of [...dataset.cities].sort((a, b) => b[7] - a[7] || a[0] - b[0])) {
    const countryCode = city[3]
    let group = groups.get(countryCode)
    if (!group) {
      group = {
        code: countryCode,
        name: getCountryName(countryCode),
        cities: [],
        totalCount: 0,
      }
      groups.set(countryCode, group)
    }

    group.totalCount += 1
    if (group.cities.length < materializationLimit) {
      group.cities.push(materializeCity(city))
    }
  }

  return [...groups.values()].sort((left, right) =>
    countryCollator.compare(left.name, right.name))
}

export function groupCitiesByCountry(
  cities: readonly City[],
): CountryCityGroup[] {
  const groups = new Map<string, CountryCityGroup>()

  for (const city of cities) {
    let group = groups.get(city.countryCode)
    if (!group) {
      group = {
        code: city.countryCode,
        name: getCountryName(city.countryCode),
        cities: [],
        totalCount: 0,
      }
      groups.set(city.countryCode, group)
    }
    group.cities.push(city)
    group.totalCount += 1
  }

  return [...groups.values()].sort((left, right) =>
    countryCollator.compare(left.name, right.name))
}
