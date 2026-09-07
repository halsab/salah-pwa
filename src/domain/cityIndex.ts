import { haversineDistanceKm } from './location'
import { normalizeCitySearch, type CityDatasetSource, type CompactCityRecord } from './cities'

export interface CityShardDescriptor {
  id: string
  country: string
  count: number
  bytes: number
  sha256: string
  filter: string
}

export interface CityIndex {
  schemaVersion: 4
  version: string
  checksum: string
  source: CityDatasetSource
  overview: CompactCityRecord[]
  shards: CityShardDescriptor[]
  // Ячейки 2° содержат только номера пакетов, а не административные границы.
  cells: [latitudeCell: number, longitudeCell: number, shards: number[]][]
}

export interface CityShard {
  schemaVersion: 4
  version: string
  id: string
  cities: CompactCityRecord[]
}

export function searchTrigrams(value: string): string[] {
  const grams = new Set<string>()
  for (const term of value.split(/\s+/)) {
    for (let i = 0; i <= term.length - 3; i += 1) grams.add(term.slice(i, i + 3))
  }
  return [...grams]
}

function hashes(value: string, bits: number): number[] {
  let a = 2166136261
  let b = 5381
  for (let i = 0; i < value.length; i += 1) {
    a = Math.imul(a ^ value.charCodeAt(i), 16777619)
    b = Math.imul(b, 33) ^ value.charCodeAt(i)
  }
  return [a >>> 0, b >>> 0, (a + b) >>> 0].map(n => n % bits)
}

export function createSearchFilter(cities: readonly CompactCityRecord[]): string {
  const grams = new Set(cities.flatMap(c => searchTrigrams(`${c[2].join(' ')} ${c[10]}`)))
  const bytes = new Uint8Array(Math.max(8, Math.ceil(grams.size * 8 / 8)))
  for (const gram of grams) {
    for (const bit of hashes(gram, bytes.length * 8)) bytes[bit >> 3] = (bytes[bit >> 3] ?? 0) | (1 << (bit & 7))
  }
  return btoa(String.fromCharCode(...bytes))
}

export function matchesSearchFilter(filter: Uint8Array, grams: readonly string[]): boolean {
  return grams.every(gram => hashes(gram, filter.length * 8)
    .every(bit => ((filter[bit >> 3] ?? 0) & (1 << (bit & 7))) !== 0))
}

export function decodeSearchFilter(filter: string): Uint8Array {
  return Uint8Array.from(atob(filter), c => c.charCodeAt(0))
}

export function citySearchCandidates(index: CityIndex, query: string, filters = index.shards.map(s => decodeSearchFilter(s.filter))): CityShardDescriptor[] {
  const grams = searchTrigrams(normalizeCitySearch(query))
  if (!grams.length) return []
  return index.shards.filter((_, i) => filters[i] && matchesSearchFilter(filters[i], grams))
}

export function cityCell(latitude: number, longitude: number): [number, number] {
  return [Math.min(89, Math.floor((latitude + 90) / 2)), Math.min(179, Math.floor((longitude + 180) / 2))]
}

export function nearestCityCandidates(index: CityIndex, latitude: number, longitude: number, radius: number): CityShardDescriptor[] {
  const shards = new Set<number>()
  for (const [lat, lon, ids] of index.cells) {
    // 223 км — верхняя граница пути от центра ячейки до любой её точки по сфере.
    if (haversineDistanceKm(latitude, longitude, lat * 2 - 89, lon * 2 - 179) <= radius + 223) {
      ids.forEach(id => shards.add(id))
    }
  }
  return [...shards].sort((a, b) => a - b).flatMap(i => index.shards[i] ? [index.shards[i]] : [])
}
