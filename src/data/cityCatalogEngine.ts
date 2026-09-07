import { findNearestCity, getCountryGroups, searchCities, validNearestQuery, type CompactCityRecord } from '../domain/cities'
import { citySearchCandidates, decodeSearchFilter, nearestCityCandidates, searchTrigrams, type CityIndex, type CityShard, type CityShardDescriptor } from '../domain/cityIndex'
import { normalizeCitySearch } from '../domain/cities'
import type { DataFailure } from '../domain/errors'
import { failure, success, type Result } from '../domain/result'
import type { CityCatalogService, CitySearchResult } from './cityCatalog'
import { loadCityIndex, loadCityShard, loadPreviousCityIndex } from './cityRepository'

export interface CatalogRepository {
  loadIndex: () => Promise<Result<CityIndex, DataFailure>>
  loadShard: (index: CityIndex, descriptor: CityShardDescriptor, localOnly?: boolean) => Promise<Result<CityShard, DataFailure>>
  previousIndex: () => Promise<CityIndex | undefined>
}
const MAX_SEARCH_PACKAGES = 32
const MAX_MEMORY_PACKAGES = 4

export function createCityCatalogEngine(repository: CatalogRepository = {
  loadIndex: loadCityIndex, loadShard: loadCityShard, previousIndex: loadPreviousCityIndex,
}): CityCatalogService {
  let indexPromise: Promise<Result<CityIndex, DataFailure>> | undefined
  let filters: Uint8Array[] | undefined
  const memory = new Map<string, CityShard>()
  // Операции сериализованы; внутри одной операции одновременно загружаются два пакета.
  let queue = Promise.resolve()
  let searchRevision = 0
  const serial = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = queue.then(operation, operation)
    queue = next.then(() => undefined, () => undefined)
    return next
  }
  const getIndex = () => {
    if (!indexPromise) indexPromise = repository.loadIndex().then(result => {
      if (!result.ok) indexPromise = undefined
      return result
    }).catch(() => { indexPromise = undefined; return failure<DataFailure>({ kind: 'data', reason: 'unavailable' }) })
    return indexPromise
  }
  const getShard = async (index: CityIndex, descriptor: CityShardDescriptor, localOnly: boolean) => {
    const key = `${index.version}/${descriptor.id}`
    const cached = memory.get(key)
    if (cached) {
      memory.delete(key); memory.set(key, cached)
      return success(cached)
    }
    const result = await repository.loadShard(index, descriptor, localOnly)
    if (result.ok) {
      memory.set(key, result.value)
      if (memory.size > MAX_MEMORY_PACKAGES) {
        const oldest = memory.keys().next().value
        if (oldest) memory.delete(oldest)
      }
    }
    return result
  }
  const searchIndex = async (index: CityIndex, query: string, localOnly: boolean, revision: number): Promise<Result<CitySearchResult, DataFailure>> => {
    const grams = searchTrigrams(normalizeCitySearch(query))
    filters ??= index.shards.map(s => decodeSearchFilter(s.filter))
    const candidates = citySearchCandidates(index, query, localOnly ? undefined : filters)
    const rows = new Map(index.overview.map(c => [c[0], c]))
    const rank = () => searchCities({ source: index.source, cities: [...rows.values()] }, query)
    if (!grams.length || candidates.length > MAX_SEARCH_PACKAGES) {
      return success({ cities: rank(), status: 'refine', missingPackages: [] })
    }
    const missing: string[] = []
    for (let offset = 0; offset < candidates.length; offset += 2) {
      if (revision !== searchRevision) return failure({ kind: 'data', reason: 'unavailable' })
      const batch = candidates.slice(offset, offset + 2)
      const results = await Promise.all(batch.map(s => getShard(index, s, localOnly)))
      for (const [i, result] of results.entries()) {
        if (result.ok) result.value.cities.forEach(c => rows.set(c[0], c))
        else if (result.error.reason === 'invalid') return result
        else {
          const descriptor = batch[i]
          if (descriptor) missing.push(descriptor.id)
        }
      }
    }
    return success({ cities: rank(), status: missing.length ? 'needs-download' : 'complete', missingPackages: missing })
  }
  const nearestIndex = async (index: CityIndex, latitude: number, longitude: number, maxDistanceKm: number, localOnly: boolean) => {
    const candidates = nearestCityCandidates(index, latitude, longitude, maxDistanceKm)
    let nearest: CompactCityRecord | undefined
    for (let offset = 0; offset < candidates.length; offset += 2) {
      const results = await Promise.all(candidates.slice(offset, offset + 2).map(s => getShard(index, s, localOnly)))
      for (const result of results) {
        if (!result.ok) return result
        const rows = nearest ? [nearest, ...result.value.cities] : result.value.cities
        const city = findNearestCity(latitude, longitude, rows, maxDistanceKm)
        nearest = city ? rows.find(c => c[0] === city.id) : undefined
      }
    }
    return success(nearest ? findNearestCity(latitude, longitude, [nearest], maxDistanceKm) : null)
  }
  return {
    load: async () => {
      const result = await getIndex()
      if (!result.ok) return result
      const index = result.value
      const groups = getCountryGroups({ source: index.source, cities: index.overview })
      for (const group of groups) group.totalCount = index.shards.filter(s => s.country === group.code).reduce((n, s) => n + s.count, 0)
      return success({ source: index.source, countryGroups: groups })
    },
    search: (query) => {
      const revision = ++searchRevision
      return serial(async () => {
        const loaded = await getIndex()
        if (!loaded.ok) return loaded
        const result = await searchIndex(loaded.value, query, false, revision)
        if (!result.ok || result.value.status === 'needs-download') {
          const previous = await repository.previousIndex()
          if (previous && previous.version !== loaded.value.version) {
            const fallback = await searchIndex(previous, query, true, revision)
            if (fallback.ok && fallback.value.status === 'complete' && fallback.value.cities.length > 0) return success({ ...fallback.value, previousVersion: true })
          }
        }
        return result
      })
    },
    findNearest: (latitude, longitude, maxDistanceKm) => serial(async () => {
      if (!validNearestQuery(latitude, longitude, maxDistanceKm) || maxDistanceKm > 200) return failure({ kind: 'data', reason: 'invalid' })
      const loaded = await getIndex()
      if (!loaded.ok) return loaded
      const index = loaded.value
      const result = await nearestIndex(index, latitude, longitude, maxDistanceKm, false)
      if (!result.ok) {
        const previous = await repository.previousIndex()
        if (previous && previous.version !== index.version) {
          const fallback = await nearestIndex(previous, latitude, longitude, maxDistanceKm, true)
          if (fallback.ok) return fallback
        }
      }
      return result
    }),
  }
}
