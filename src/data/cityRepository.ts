import type { CityIndex, CityShard, CityShardDescriptor } from '../domain/cityIndex'
import { validateCityIndex, parseCityShard } from '../domain/citySchema'
export { parseCityIndex, parseCityShard } from '../domain/citySchema'
import { failure, success, type Result } from '../domain/result'
import type { DataFailure } from '../domain/errors'
import { readCatalogIndex, readCatalogShard, saveCatalogIndex, saveCatalogShard } from '../storage/cityCatalogStorage'

const unavailable = (): DataFailure => ({ kind: 'data', reason: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'unavailable' })
const baseUrl = () => `${import.meta.env.BASE_URL}data/cities/`
async function fetchText(url: string): Promise<Result<string, DataFailure>> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!response.ok) return failure({ kind: 'data', reason: 'unavailable' })
    return success(await response.text())
  } catch { return failure(unavailable()) }
}
export async function loadCityIndex(): Promise<Result<CityIndex, DataFailure>> {
  const response = await fetchText(`${baseUrl()}index.json`)
  if (response.ok) {
    try {
      const index = await validateCityIndex(JSON.parse(response.value))
      await saveCatalogIndex(index).catch(() => undefined)
      return success(index)
    } catch { /* Некорректное обновление не заменяет рабочий индекс. */ }
  }
  const stored = await readCatalogIndex().catch(() => undefined)
  if (stored) {
    try { return success(await validateCityIndex(stored)) } catch { /* Повреждённый кеш не используется. */ }
  }
  return failure(response.ok ? { kind: 'data', reason: 'invalid' } : response.error)
}
export async function loadCityShard(index: CityIndex, descriptor: CityShardDescriptor, localOnly = false): Promise<Result<CityShard, DataFailure>> {
  const key = `${index.version}/${descriptor.id}`
  const cached = await readCatalogShard(key).catch(() => undefined)
  if (cached) {
    try { return success(await parseCityShard(cached, index, descriptor)) } catch { /* Повторная загрузка может исправить повреждённый пакет. */ }
  }
  if (localOnly) return failure({ kind: 'data', reason: 'offline' })
  const response = await fetchText(`${baseUrl()}${key}.json`)
  if (!response.ok) return response
  try {
    const shard = await parseCityShard(response.value, index, descriptor)
    await saveCatalogShard(key, response.value).catch(() => undefined)
    return success(shard)
  } catch { return failure({ kind: 'data', reason: 'invalid' }) }
}
export async function loadPreviousCityIndex(): Promise<CityIndex | undefined> {
  const previous = await readCatalogIndex('previous').catch(() => undefined)
  if (!previous) return undefined
  try { return await validateCityIndex(previous) } catch { return undefined }
}
