import {
  prepareCitySearch,
  type City,
  type CityDataset,
  type CityDatasetSource,
} from '../domain/cities'
import { isValidTimeZone } from '../domain/locationTime'

type CompactCityRecord = [
  id: number,
  name: string,
  searchNames: string,
  countryCode: string,
  latitude: number,
  longitude: number,
  population: number,
  timeZone: string,
]

interface CityDatasetFile {
  schemaVersion: 2
  source: CityDatasetSource
  cities: CompactCityRecord[]
}

const DATA_URL = `${import.meta.env.BASE_URL}data/cities-current.json`

function isSource(value: unknown): value is CityDatasetSource {
  if (!value || typeof value !== 'object') return false
  const source = value as Partial<CityDatasetSource>
  return (
    typeof source.name === 'string' &&
    typeof source.url === 'string' &&
    typeof source.license === 'string' &&
    typeof source.licenseUrl === 'string' &&
    typeof source.updatedAt === 'string'
  )
}

function isCityRecord(value: unknown): value is CompactCityRecord {
  return (
    Array.isArray(value) &&
    value.length === 8 &&
    Number.isInteger(value[0]) &&
    typeof value[1] === 'string' &&
    typeof value[2] === 'string' &&
    typeof value[3] === 'string' &&
    Number.isFinite(value[4]) &&
    Number.isFinite(value[5]) &&
    Number.isFinite(value[6]) &&
    typeof value[7] === 'string' &&
    isValidTimeZone(value[7])
  )
}

export function parseCityDataset(value: unknown): CityDataset {
  if (!value || typeof value !== 'object') {
    throw new Error('Справочник городов имеет неизвестный формат')
  }
  const file = value as Partial<CityDatasetFile>
  if (
    file.schemaVersion !== 2 ||
    !isSource(file.source) ||
    !Array.isArray(file.cities) ||
    file.cities.length === 0 ||
    !file.cities.every(isCityRecord)
  ) {
    throw new Error('Справочник городов имеет неизвестный формат')
  }

  const cities: City[] = file.cities.map(
    ([
      id,
      name,
      searchNames,
      countryCode,
      latitude,
      longitude,
      population,
      timeZone,
    ]) => ({
      id,
      name,
      searchNames,
      countryCode,
      latitude,
      longitude,
      population,
      timeZone,
    }),
  )

  const dataset = { source: file.source, cities }
  prepareCitySearch(dataset)
  return dataset
}

export async function loadCityDataset(): Promise<CityDataset> {
  const response = await fetch(DATA_URL)
  if (!response.ok) {
    throw new Error(`Справочник городов недоступен: ${response.status}`)
  }
  return parseCityDataset(await response.json())
}
