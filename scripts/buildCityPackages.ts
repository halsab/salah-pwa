import { createHash } from 'node:crypto'
import { cityCell, createSearchFilter, type CityIndex, type CityShard } from '../src/domain/cityIndex'
import type { CityDatasetSource, CompactCityRecord } from '../src/domain/cities'

export const sha256 = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex')
const MAX_RECORDS = 300
const MAX_PAYLOAD_BYTES = 110 * 1024

export function buildCityPackages(records: readonly CompactCityRecord[], source: CityDatasetSource): { index: CityIndex; shards: Record<string, CityShard> } {
  const sorted = [...records].sort((a, b) => a[0] - b[0])
  const version = sha256(JSON.stringify({ schemaVersion: 4, packing: 'country-lat-300-110k-bloom8', source, cities: sorted })).slice(0, 20)
  const countries = [...new Set(sorted.map(c => c[3]))].sort()
  const shards: Record<string, CityShard> = {}
  const index: CityIndex = { schemaVersion: 4, version, checksum: '', source, overview: [], shards: [], cells: [] }
  const cells = new Map<string, Set<number>>()
  for (const country of countries) {
    const cities = sorted.filter(c => c[3] === country)
    index.overview.push(...[...cities].sort((a, b) => b[7] - a[7] || a[0] - b[0]).slice(0, 3))
    cities.sort((a, b) => a[5] - b[5] || a[6] - b[6] || a[0] - b[0])
    let chunk: CompactCityRecord[] = []
    let bytes = 0
    let part = 0
    const flush = () => {
      if (!chunk.length) return
      const id = `${country}-${part++}`
      const shard: CityShard = { schemaVersion: 4, version, id, cities: chunk }
      const text = JSON.stringify(shard)
      const shardIndex = index.shards.length
      index.shards.push({ id, country, count: chunk.length, bytes: Buffer.byteLength(text), sha256: sha256(text), filter: createSearchFilter(chunk) })
      shards[id] = shard
      for (const city of chunk) {
        const key = cityCell(city[5], city[6]).join(',')
        const ids = cells.get(key) ?? new Set<number>()
        ids.add(shardIndex)
        cells.set(key, ids)
      }
      chunk = []
      bytes = 0
    }
    for (const city of cities) {
      const size = Buffer.byteLength(JSON.stringify(city)) + 1
      if (chunk.length >= MAX_RECORDS || bytes + size > MAX_PAYLOAD_BYTES) flush()
      chunk.push(city)
      bytes += size
    }
    flush()
  }
  index.cells = [...cells].map(([key, ids]): CityIndex['cells'][number] => {
    const [lat, lon] = key.split(',').map(Number)
    if (lat === undefined || lon === undefined) throw new Error('Некорректная ячейка')
    return [lat, lon, [...ids].sort((a, b) => a - b)]
  }).sort((a, b) => a[0] - b[0] || a[1] - b[1])
  index.checksum = sha256(JSON.stringify(index))
  return { index, shards }
}
