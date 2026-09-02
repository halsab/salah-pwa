import type { City, CityDatasetSource, CountryCityGroup } from '../domain/cities'

export interface CityCatalog {
  source: CityDatasetSource
  countryGroups: CountryCityGroup[]
}

export interface CityCatalogService {
  load: () => Promise<CityCatalog>
  search: (query: string) => Promise<City[]>
  findNearest: (
    latitude: number,
    longitude: number,
    maxDistanceKm: number,
  ) => Promise<City | null>
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
  | { id: number; ok: false; error: string }
