import type { City, CityDatasetSource, CountryCityGroup } from '../domain/cities'
import type { DataFailure } from '../domain/errors'
import type { Result } from '../domain/result'

export interface CityCatalog {
  source: CityDatasetSource
  countryGroups: CountryCityGroup[]
}

export interface CityCatalogService {
  load: () => Promise<Result<CityCatalog, DataFailure>>
  search: (query: string) => Promise<Result<City[], DataFailure>>
  findNearest: (
    latitude: number,
    longitude: number,
    maxDistanceKm: number,
  ) => Promise<Result<City | null, DataFailure>>
}

export type CityWorkerCommand =
  | { type: 'load' }
  | { type: 'search'; query: string }
  | {
      type: 'findNearest'
      latitude: number
      longitude: number
      maxDistanceKm: number
    }

export type CityWorkerRequest = CityWorkerCommand & { id: number }

export type CityWorkerResponse =
  | { id: number; ok: true; result: CityCatalog | City[] | City | null }
  | { id: number; ok: false; error: DataFailure }
