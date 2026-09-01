import { haversineDistanceKm } from './location'

export interface City {
  id: number
  name: string
  searchNames: string
  countryCode: string
  latitude: number
  longitude: number
  population: number
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

  const matches: City[] = []
  for (const city of dataset.cities) {
    const countryName = getCountryName(city.countryCode)
    const englishCountryName = englishCountryNames.of(city.countryCode) ?? ''
    const haystack = normalize(
      `${city.name} ${city.searchNames} ${countryName} ${englishCountryName}`,
    )
    if (terms.every((term) => haystack.includes(term))) {
      matches.push(city)
      if (matches.length === limit) break
    }
  }
  return matches
}

export function getCountryGroups(
  dataset: CityDataset,
  citiesPerCountry = 5,
): CountryCityGroup[] {
  const grouped = new Map<string, City[]>()

  for (const city of dataset.cities) {
    const cities = grouped.get(city.countryCode) ?? []
    if (cities.length < citiesPerCountry) {
      cities.push(city)
      grouped.set(city.countryCode, cities)
    }
  }

  return [...grouped.entries()]
    .map(([code, cities]) => ({ code, name: getCountryName(code), cities }))
    .sort((left, right) => countryCollator.compare(left.name, right.name))
}
