import { describe, expect, it, vi } from 'vitest'
import { buildCityPackages } from './buildCityPackages'
import { createCityCatalogEngine, type CatalogRepository } from '../src/data/cityCatalogEngine'
import { success, failure } from '../src/domain/result'
import type { CityIndex, CityShardDescriptor } from '../src/domain/cityIndex'
import type { CompactCityRecord } from '../src/domain/cities'
const source = { name: 'GeoNames', url: 'https://www.geonames.org/', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', updatedAt: '2026-09-07' }
const rows: CompactCityRecord[] = [
  [1, 'Киров', ['киров', 'kirov'], 'RU', '33', 58.6, 49.6, 5000, 'Europe/Moscow', 'Кировская область', 'россия'],
  [2, 'Стамбул', ['стамбул', 'istanbul'], 'TR', '34', 41, 29, 5000, 'Europe/Istanbul', 'Стамбул', 'турция'],
]
const { index, shards } = buildCityPackages(rows, source)
function setup() {
  const loadIndex = vi.fn().mockResolvedValue(success(index))
  const loadShard = vi.fn<CatalogRepository['loadShard']>().mockImplementation((_index: CityIndex, descriptor: CityShardDescriptor) => Promise.resolve(success(shards[descriptor.id] ?? { schemaVersion: 4, version: index.version, id: descriptor.id, cities: [] })))
  const engine = createCityCatalogEngine({ loadIndex, loadShard, previousIndex: () => Promise.resolve(undefined) })
  return { engine, loadShard, loadIndex }
}
describe('city catalog engine', () => {
  it('обзор не загружает пакеты, поиск и nearest читают только нужную страну', async () => {
    const { engine, loadShard } = setup()
    expect((await engine.load()).ok).toBe(true)
    expect(loadShard).not.toHaveBeenCalled()
    expect(await engine.search('kirov')).toMatchObject({ ok: true, value: { status: 'complete', cities: [{ id: 1, timeZone: 'Europe/Moscow' }] } })
    expect(loadShard.mock.calls.map(c => c[1].country)).toEqual(['RU'])
    expect(await engine.findNearest(58.6, 49.6, 5)).toMatchObject({ ok: true, value: { id: 1 } })
    expect(loadShard).toHaveBeenCalledTimes(1)
  })
  it('даёт частичный офлайн-результат, не ложное отсутствие, и позволяет повтор сети', async () => {
    const { engine, loadShard } = setup()
    loadShard.mockResolvedValueOnce(failure({ kind: 'data', reason: 'offline' }))
    expect(await engine.search('kirov')).toMatchObject({ ok: true, value: { status: 'needs-download', missingPackages: ['RU-0'] } })
    expect(await engine.search('kirov')).toMatchObject({ ok: true, value: { status: 'complete' } })
    expect(loadShard).toHaveBeenCalledTimes(2)
  })
  it('не смешивает повреждённую версию; nearest не утверждает отсутствие при недоступных данных', async () => {
    const { engine, loadShard } = setup()
    loadShard.mockResolvedValue(failure({ kind: 'data', reason: 'invalid' }))
    expect(await engine.search('kirov')).toEqual(failure({ kind: 'data', reason: 'invalid' }))
    expect(await engine.findNearest(58.6, 49.6, 5)).toEqual(failure({ kind: 'data', reason: 'invalid' }))
    expect(await engine.findNearest(500, 0, 5)).toEqual(failure({ kind: 'data', reason: 'invalid' }))
  })
  it('короткий запрос ограничен обзором; океан возвращает null без пакетов', async () => {
    const { engine, loadShard } = setup()
    expect(await engine.search('ки')).toMatchObject({ ok: true, value: { status: 'refine' } })
    expect(await engine.findNearest(0, -140, 20)).toEqual(success(null))
    expect(loadShard).not.toHaveBeenCalled()
  })
})

it('сохраняет результаты предыдущей версии при отказе обновления пакета', async () => {
  const previous = buildCityPackages(rows, source)
  const updated = buildCityPackages(rows, { ...source, updatedAt: '2026-09-08' })
  const loadShard = vi.fn<CatalogRepository['loadShard']>().mockImplementation((catalog: CityIndex, descriptor: CityShardDescriptor, localOnly?: boolean) => Promise.resolve(catalog.version === previous.index.version && localOnly
    ? success(previous.shards[descriptor.id] ?? { schemaVersion: 4, version: previous.index.version, id: descriptor.id, cities: [] }) : failure({ kind: 'data', reason: 'offline' })))
  const engine = createCityCatalogEngine({ loadIndex: () => Promise.resolve(success(updated.index)), loadShard, previousIndex: () => Promise.resolve(previous.index) })
  expect(await engine.search('kirov')).toMatchObject({ ok: true, value: { status: 'complete', previousVersion: true, cities: [{ id: 1 }] } })
})

it('при смене запроса прекращает очередь старых пакетов и держит не более двух загрузок', async () => {
  const manyRows = Array.from({ length: 1500 }, (_, i): CompactCityRecord => [100 + i, `Киров ${i}`, [`киров ${i}`], 'RU', '33', 58.6, 49.6, 5000, 'Europe/Moscow', 'Кировская область', 'россия'])
  const generated = buildCityPackages(manyRows, source)
  let active = 0
  let maximum = 0
  const releases: (() => void)[] = []
  const loadShard = vi.fn<CatalogRepository['loadShard']>().mockImplementation(async (_catalog: CityIndex, descriptor: CityShardDescriptor) => {
    maximum = Math.max(maximum, ++active)
    await new Promise<void>(resolve => releases.push(resolve))
    active -= 1
    return success(generated.shards[descriptor.id] ?? { schemaVersion: 4, version: generated.index.version, id: descriptor.id, cities: [] })
  })
  const engine = createCityCatalogEngine({ loadIndex: () => Promise.resolve(success(generated.index)), loadShard, previousIndex: () => Promise.resolve(undefined) })
  const old = engine.search('киров')
  await vi.waitFor(() => expect(releases).toHaveLength(2))
  const next = engine.search('zzzzzzzzz')
  releases.forEach(release => release())
  expect(await old).toMatchObject({ ok: false })
  expect(await next).toMatchObject({ ok: true, value: { status: 'complete', cities: [] } })
  expect(maximum).toBe(2)
  expect(loadShard).toHaveBeenCalledTimes(2)
})

it('вытесняет старый пакет из памяти после четырёх пакетов, сохраняя возможность перечитать его', async () => {
  const cities = Array.from({ length: 1500 }, (_, i): CompactCityRecord => [100 + i, `Город ${i}`, [`город ${i}`], 'RU', '33', Math.floor(i / 300) * 10, 40, 5000, 'UTC', '', 'россия'])
  const generated = buildCityPackages(cities, source)
  const loadShard = vi.fn<CatalogRepository['loadShard']>().mockImplementation((_index, descriptor) => {
    const shard = generated.shards[descriptor.id]
    if (!shard) throw new Error('Нет пакета')
    return Promise.resolve(success(shard))
  })
  const engine = createCityCatalogEngine({ loadIndex: () => Promise.resolve(success(generated.index)), loadShard, previousIndex: () => Promise.resolve(undefined) })
  expect(await engine.search('город')).toMatchObject({ ok: true, value: { status: 'complete' } })
  expect(loadShard).toHaveBeenCalledTimes(5)
  expect(await engine.findNearest(0, 40, 0)).toMatchObject({ ok: true, value: { id: 100 } })
  expect(loadShard).toHaveBeenCalledTimes(6)
})

it('не подменяет отсутствие нового пакета пустым результатом предыдущей версии', async () => {
  const previous = buildCityPackages(rows.filter(c => c[0] === 2), source)
  const engine = createCityCatalogEngine({
    loadIndex: () => Promise.resolve(success(index)),
    loadShard: () => Promise.resolve(failure({ kind: 'data', reason: 'offline' })),
    previousIndex: () => Promise.resolve(previous.index),
  })
  expect(await engine.search('kirov')).toMatchObject({ ok: true, value: { status: 'needs-download', missingPackages: ['RU-0'] } })
})
