import { haversineDistanceKm } from './location'

export interface City {
  id: number
  name: string
  searchNames: string
  countryCode: string
  latitude: number
  longitude: number
  population: number
  timeZone: string
}

export interface CityDatasetSource {
  name: string
  url: string
  license: string
  licenseUrl: string
  updatedAt: string
}

export interface CityDataset {
  source: CityDatasetSource
  cities: City[]
}

export interface CountryCityGroup {
  code: string
  name: string
  cities: City[]
}

const countryNames = new Intl.DisplayNames(['ru'], { type: 'region' })
const englishCountryNames = new Intl.DisplayNames(['en'], { type: 'region' })
const countryCollator = new Intl.Collator('ru', { sensitivity: 'base' })
const citySearchIndexes = new WeakMap<CityDataset, readonly string[]>()

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('ru-RU')
}

export function getCountryName(countryCode: string): string {
  return countryNames.of(countryCode) ?? countryCode
}

export function formatCityLabel(city: City): string {
  return `${city.name}, ${getCountryName(city.countryCode)}`
}

export function prepareCitySearch(dataset: CityDataset): void {
  if (citySearchIndexes.has(dataset)) return

  const countrySearchNames = new Map<string, string>()
  const searchIndex = dataset.cities.map((city) => {
    let countrySearchName = countrySearchNames.get(city.countryCode)
    if (countrySearchName === undefined) {
      countrySearchName = normalize(
        `${getCountryName(city.countryCode)} ${englishCountryNames.of(city.countryCode) ?? ''}`,
      )
      countrySearchNames.set(city.countryCode, countrySearchName)
    }
    return `${normalize(`${city.name} ${city.searchNames}`)} ${countrySearchName}`
  })

  citySearchIndexes.set(dataset, searchIndex)
}

export function findNearestCity(
  latitude: number,
  longitude: number,
  cities: City[],
  maxDistanceKm: number,
): City | null {
  let nearest: City | null = null
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const city of cities) {
    const distance = haversineDistanceKm(
      latitude,
      longitude,
      city.latitude,
      city.longitude,
    )
    if (distance < nearestDistance) {
      nearest = city
      nearestDistance = distance
    }
  }

  return nearestDistance <= maxDistanceKm ? nearest : null
}

export function searchCities(
  dataset: CityDataset,
  query: string,
  limit = 60,
): City[] {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return []

  prepareCitySearch(dataset)
  const searchIndex = citySearchIndexes.get(dataset)!

  const matches: City[] = []
  for (let index = 0; index < dataset.cities.length; index += 1) {
    const haystack = searchIndex[index]!
    if (terms.every((term) => haystack.includes(term))) {
      matches.push(dataset.cities[index]!)
      if (matches.length === limit) break
    }
  }
  return matches
}

export function getCountryGroups(
  dataset: CityDataset,
  citiesPerCountry = 5,
): CountryCityGroup[] {
  return groupCitiesByCountry(dataset.cities).map((group) => ({
    ...group,
    cities: group.cities.slice(0, citiesPerCountry),
  }))
}

export function groupCitiesByCountry(cities: readonly City[]): CountryCityGroup[] {
  const grouped = new Map<string, City[]>()

  for (const city of cities) {
    const countryCities = grouped.get(city.countryCode) ?? []
    countryCities.push(city)
    grouped.set(city.countryCode, countryCities)
  }

  return [...grouped.entries()]
    .map(([code, cities]) => ({ code, name: getCountryName(code), cities }))
    .sort((left, right) => countryCollator.compare(left.name, right.name))
}
