import {
  normalizeCitySearch,
  type CityDataset,
  type CityDatasetSource,
  type CompactCityRecord,
} from '../domain/cities'
import type { DataFailure } from '../domain/errors'
import { isValidTimeZone } from '../domain/locationTime'
import { failure, success, type Result } from '../domain/result'

interface CityDatasetFile {
  schemaVersion: 3
  source: CityDatasetSource
  cities: CompactCityRecord[]
}

const DATA_URL = `${import.meta.env.BASE_URL}data/cities-current.json`

function isSource(value: unknown): value is CityDatasetSource {
  if (!value || typeof value !== 'object') return false
  const source = value as Partial<CityDatasetSource>
  return (
    typeof source.name === 'string'
    && typeof source.url === 'string'
    && typeof source.license === 'string'
    && typeof source.licenseUrl === 'string'
    && typeof source.updatedAt === 'string'
  )
}

function isCityRecord(value: unknown): value is CompactCityRecord {
  if (!Array.isArray(value) || value.length !== 9) return false

  const row: readonly unknown[] = value
  const normalizedSearchKey = row[2]
  return (
    Number.isInteger(row[0])
    && typeof row[0] === 'number'
    && row[0] > 0
    && typeof row[1] === 'string'
    && row[1].length > 0
    && typeof normalizedSearchKey === 'string'
    && normalizedSearchKey.length > 0
    && normalizeCitySearch(normalizedSearchKey) === normalizedSearchKey
    && typeof row[3] === 'string'
    && /^[A-Z]{2}$/.test(row[3])
    && typeof row[4] === 'string'
    && typeof row[5] === 'number'
    && Number.isFinite(row[5])
    && row[5] >= -90
    && row[5] <= 90
    && typeof row[6] === 'number'
    && Number.isFinite(row[6])
    && row[6] >= -180
    && row[6] <= 180
    && Number.isInteger(row[7])
    && typeof row[7] === 'number'
    && row[7] >= 5_000
    && typeof row[8] === 'string'
    && isValidTimeZone(row[8])
  )
}

function hasUniqueCityIds(cities: readonly CompactCityRecord[]): boolean {
  const ids = new Set<number>()
  for (const city of cities) {
    if (ids.has(city[0])) return false
    ids.add(city[0])
  }
  return true
}

export function parseCityDataset(value: unknown): CityDataset {
  if (!value || typeof value !== 'object') {
    throw new Error('Справочник городов имеет неизвестный формат')
  }
  const file = value as Partial<CityDatasetFile>
  if (
    file.schemaVersion !== 3
    || !isSource(file.source)
    || !Array.isArray(file.cities)
    || file.cities.length === 0
    || !file.cities.every(isCityRecord)
    || !hasUniqueCityIds(file.cities)
  ) {
    throw new Error('Справочник городов имеет неизвестный формат')
  }

  return { source: file.source, cities: file.cities }
}

export async function loadCityDataset(): Promise<Result<CityDataset, DataFailure>> {
  let response: Response
  try {
    response = await fetch(DATA_URL)
  } catch {
    return failure({
      kind: 'data',
      reason: typeof navigator !== 'undefined' && !navigator.onLine
        ? 'offline'
        : 'unavailable',
    })
  }
  if (!response.ok) {
    return failure({ kind: 'data', reason: 'unavailable' })
  }

  try {
    const value: unknown = await response.json()
    return success(parseCityDataset(value))
  } catch {
    return failure({ kind: 'data', reason: 'invalid' })
  }
}
