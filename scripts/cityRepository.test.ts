/// <reference lib="dom" />
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDB } from 'idb'
import { buildCityPackages } from './buildCityPackages'
import { loadCityIndex, loadCityShard, parseCityIndex, parseCityShard } from '../src/data/cityRepository'
import { saveCatalogIndex, saveCatalogShard } from '../src/storage/cityCatalogStorage'
import type { CompactCityRecord } from '../src/domain/cities'
const source = { name: 'GeoNames', url: 'https://www.geonames.org/', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', updatedAt: '2026-09-07' }
const city: CompactCityRecord = [745044, 'Стамбул', ['стамбул', 'istanbul'], 'TR', '34', 41, 29, 5000, 'Europe/Istanbul', 'Стамбул', 'турция']
const { index, shards } = buildCityPackages([city], source)
const descriptor = index.shards[0]
if (!descriptor) throw new Error('Нет тестового пакета')
const payload = JSON.stringify(shards[descriptor.id])
beforeEach(async () => {
  await saveCatalogIndex(index)
  const db = await openDB('salah-city-catalog')
  await db.clear('indexes'); await db.clear('shards'); db.close()
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
describe('catalog version validation and persistence', () => {
  it('проверяет schema, SHA-256, timezone, уникальность и индекс ячеек', async () => {
    expect(parseCityIndex(index)).toBe(index)
    expect((await parseCityShard(payload, index, descriptor)).cities).toEqual([city])
    expect(() => parseCityIndex({ ...index, schemaVersion: 3 })).toThrow()
    expect(() => parseCityIndex({ ...index, overview: [city, city] })).toThrow()
    expect(() => parseCityIndex({ ...index, overview: [[...city.slice(0, 8), 'Mars/Olympus', ...city.slice(9)]] })).toThrow()
    await expect(parseCityShard(payload, { ...index, version: 'a'.repeat(20) }, descriptor)).rejects.toThrow()
    await expect(parseCityShard(payload.replace('Стамбул', 'Ошибка!'), index, descriptor)).rejects.toThrow()
    await expect(parseCityShard(payload, { ...index, cells: [] }, descriptor)).rejects.toThrow()
  })
  it('отказ обновления сохраняет рабочие индекс и пакет; офлайн повтор не требует сети', async () => {
    await saveCatalogIndex(index)
    await saveCatalogShard(`${index.version}/${descriptor.id}`, payload)
    const fetch = vi.fn().mockRejectedValue(new TypeError('offline'))
    vi.stubGlobal('fetch', fetch)
    expect(await loadCityIndex()).toEqual({ ok: true, value: index })
    fetch.mockClear()
    expect(await loadCityShard(index, descriptor)).toMatchObject({ ok: true, value: { cities: [city] } })
    expect(fetch).not.toHaveBeenCalled()
  })
  it('не сохраняет повреждённый пакет, повтор может загрузить исправный', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('{}')).mockResolvedValueOnce(new Response(payload))
    vi.stubGlobal('fetch', fetch)
    expect(await loadCityShard(index, descriptor)).toMatchObject({ ok: false, error: { reason: 'invalid' } })
    expect(await loadCityShard(index, descriptor)).toMatchObject({ ok: true })
    expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining(`/data/cities/${index.version}/TR-0.json`), expect.anything())
    fetch.mockClear()
    expect(await loadCityShard(index, descriptor)).toMatchObject({ ok: true })
    expect(fetch).not.toHaveBeenCalled()
  })
  it('не смешивает пакет предыдущей версии с новой; возвращает offline вместо пустого списка', async () => {
    await saveCatalogShard(`old/TR-0`, payload)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    expect(await loadCityShard(index, descriptor)).toEqual({ ok: false, error: { kind: 'data', reason: 'offline' } })
  })
})

it('отклоняет синтаксически правильный, но повреждённый индекс и сохраняет старый', async () => {
  await saveCatalogIndex(index)
  const broken = structuredClone(index)
  const shard = broken.shards[0]
  if (!shard) throw new Error('Нет пакета')
  shard.filter = 'A'.repeat(shard.filter.length)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(broken))))
  expect(await loadCityIndex()).toEqual({ ok: true, value: index })
})

it('исправный индекс восстанавливает повреждённую локальную копию той же версии', async () => {
  await saveCatalogIndex({ ...index, checksum: '0'.repeat(64) })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(index))).mockRejectedValue(new TypeError('offline')))
  expect(await loadCityIndex()).toEqual({ ok: true, value: index })
  expect(await loadCityIndex()).toEqual({ ok: true, value: index })
})

it.each([
  [false, 'offline'],
  [true, 'unavailable'],
] as const)('классифицирует сетевой отказ пакета при onLine=%s как %s', async (online, reason) => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online)
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')))
  expect(await loadCityShard(index, descriptor)).toEqual({ ok: false, error: { kind: 'data', reason } })
})

it('классифицирует HTTP-сбой как unavailable независимо от onLine', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })))
  expect(await loadCityShard(index, descriptor)).toEqual({ ok: false, error: { kind: 'data', reason: 'unavailable' } })
})

it.each(['{', '{"schemaVersion":2}'])('отклоняет повреждённый индекс без сохранённого fallback: %s', async (text) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(text)))
  expect(await loadCityIndex()).toEqual({ ok: false, error: { kind: 'data', reason: 'invalid' } })
})

it.each([{ names: [] }, { names: ['Стамбул', 'istanbul'] }])('отклоняет пустые и ненормализованные поисковые ключи: $names', ({ names }) => {
  const invalidCity = [...city]
  invalidCity[2] = names
  expect(() => parseCityIndex({ ...index, overview: [invalidCity] })).toThrow()
})
