import { normalizeCitySearch, type CityDatasetSource, type CompactCityRecord } from './cities'
import { cityCell, type CityIndex, type CityShard, type CityShardDescriptor } from './cityIndex'
import { isValidTimeZone } from './locationTime'

function invalid(): never { throw new Error('Справочник городов имеет неизвестный формат или несовместимую версию') }
function object(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' }
const normalized = (v: unknown): v is string => typeof v === 'string' && normalizeCitySearch(v) === v
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
const version = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{20}$/.test(v)
const country = (v: unknown): v is string => typeof v === 'string' && /^[A-Z]{2}$/.test(v)

function isSource(v: unknown): v is CityDatasetSource {
  return object(v) && ['name', 'url', 'license', 'licenseUrl', 'updatedAt'].every(k => typeof v[k] === 'string' && v[k].length > 0)
}
export function isCityRecord(v: unknown): v is CompactCityRecord {
  if (!Array.isArray(v) || v.length !== 11) return false
  const row: unknown[] = v
  return typeof row[0] === 'number' && Number.isSafeInteger(row[0]) && row[0] > 0
    && typeof row[1] === 'string' && row[1].length > 0
    && Array.isArray(row[2]) && row[2].length > 0 && row[2].every(n => normalized(n) && n.length > 0)
    && row[2][0] === normalizeCitySearch(row[1])
    && country(row[3]) && typeof row[4] === 'string'
    && typeof row[5] === 'number' && Number.isFinite(row[5]) && Math.abs(row[5]) <= 90
    && typeof row[6] === 'number' && Number.isFinite(row[6]) && Math.abs(row[6]) <= 180
    && typeof row[7] === 'number' && Number.isSafeInteger(row[7]) && row[7] >= 5000
    && typeof row[8] === 'string' && isValidTimeZone(row[8])
    && typeof row[9] === 'string' && normalized(row[10])
}
function uniqueCities(cities: CompactCityRecord[]): boolean { return new Set(cities.map(c => c[0])).size === cities.length }
function isDescriptor(v: unknown): v is CityShardDescriptor {
  return object(v) && country(v.country) && typeof v.id === 'string' && new RegExp(`^${v.country}-[0-9]+$`).test(v.id)
    && typeof v.count === 'number' && Number.isSafeInteger(v.count) && v.count > 0 && v.count <= 300
    && typeof v.bytes === 'number' && Number.isSafeInteger(v.bytes) && v.bytes > 0 && v.bytes <= 128 * 1024
    && hash(v.sha256) && typeof v.filter === 'string' && v.filter.length >= 12
    && v.filter.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(v.filter)
}
function isCell(value: unknown, shardCount: number): value is CityIndex['cells'][number] {
  if (!Array.isArray(value) || value.length !== 3) return false
  const cell: unknown[] = value
  return typeof cell[0] === 'number' && Number.isInteger(cell[0]) && cell[0] >= 0 && cell[0] < 90
    && typeof cell[1] === 'number' && Number.isInteger(cell[1]) && cell[1] >= 0 && cell[1] < 180
    && Array.isArray(cell[2]) && cell[2].length > 0 && new Set(cell[2]).size === cell[2].length
    && cell[2].every((n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < shardCount)
}
export function parseCityIndex(v: unknown): CityIndex {
  if (!object(v) || v.schemaVersion !== 4 || !version(v.version) || !hash(v.checksum) || !isSource(v.source)
    || !Array.isArray(v.overview) || !v.overview.length || !v.overview.every(isCityRecord) || !uniqueCities(v.overview)
    || !Array.isArray(v.shards) || !v.shards.length || !v.shards.every(isDescriptor)
    || new Set(v.shards.map(s => s.id)).size !== v.shards.length || !Array.isArray(v.cells)) invalid()
  const shards = v.shards
  const cells: unknown[] = v.cells
  if (!cells.length || !cells.every((cell): cell is CityIndex['cells'][number] => isCell(cell, shards.length))) invalid()
  if (new Set(cells.map(c => `${c[0]},${c[1]}`)).size !== cells.length
    || new Set(cells.flatMap(c => c[2])).size !== shards.length
    || v.overview.some(c => !shards.some(s => s.country === c[3]))) invalid()
  return v as unknown as CityIndex
}
export async function parseCityShard(text: string, index: CityIndex, descriptor: CityShardDescriptor): Promise<CityShard> {
  const bytes = new TextEncoder().encode(text)
  if (bytes.byteLength !== descriptor.bytes) invalid()
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const actual = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
  if (actual !== descriptor.sha256) invalid()
  const v: unknown = JSON.parse(text)
  if (!object(v) || v.schemaVersion !== 4 || v.version !== index.version || v.id !== descriptor.id
    || !Array.isArray(v.cities) || v.cities.length !== descriptor.count || !v.cities.every(isCityRecord)
    || !uniqueCities(v.cities) || v.cities.some(c => c[3] !== descriptor.country)) invalid()
  const position = index.shards.findIndex(s => s.id === descriptor.id)
  if (position < 0 || v.cities.some(c => {
    const [lat, lon] = cityCell(c[5], c[6])
    return !index.cells.some(cell => cell[0] === lat && cell[1] === lon && cell[2].includes(position))
  })) invalid()
  return v as unknown as CityShard
}


export async function validateCityIndex(value: unknown): Promise<CityIndex> {
  const index = parseCityIndex(value)
  const bytes = new TextEncoder().encode(JSON.stringify({ ...index, checksum: '' }))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const actual = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
  if (actual !== index.checksum) invalid()
  return index
}
