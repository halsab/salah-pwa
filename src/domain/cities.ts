import { haversineDistanceKm } from './location'

export interface City {
  id: number
  name: string
  countryCode: string
  admin1Code: string
  latitude: number
  longitude: number
  population: number
  timeZone: string
}

export type CompactCityRecord = [
  id: number,
  displayName: string,
  normalizedSearchKey: string,
  countryCode: string,
  admin1Code: string,
  latitude: number,
  longitude: number,
  population: number,
  timeZone: string,
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
    latitude: record[5],
    longitude: record[6],
    population: record[7],
    timeZone: record[8],
  }
}

export function formatCityLabel(city: City): string {
  return `${city.name}, ${getCountryName(city.countryCode)}`
}

export function findNearestCity(
  latitude: number,
  longitude: number,
  cities: readonly CompactCityRecord[],
  maxDistanceKm: number,
): City | null {
  let nearest: CompactCityRecord | undefined
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const city of cities) {
    const distance = haversineDistanceKm(
      latitude,
      longitude,
      city[5],
      city[6],
    )
    if (distance < nearestDistance) {
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

  const matches: City[] = []
  for (const city of dataset.cities) {
    const normalizedSearchKey = city[2]
    if (terms.every((term) => normalizedSearchKey.includes(term))) {
      matches.push(materializeCity(city))
      if (matches.length === resultLimit) break
    }
  }
  return matches
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

  for (const city of dataset.cities) {
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
