import { afterEach, describe, expect, it, vi } from 'vitest'

import { searchCities, type CompactCityRecord } from '../domain/cities'
import { cityCatalogService } from './cityCatalogClient'
import { loadCityDataset, parseCityDataset } from './cityRepository'

const source = {
  name: 'GeoNames',
  url: 'https://www.geonames.org/',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  updatedAt: '2026-09-01',
}

const istanbul: CompactCityRecord = [
  745044,
  'Стамбул',
  'стамбул istanbul истанбул турция',
  'TR',
  '34',
  41.0138,
  28.9497,
  15_701_602,
  'Europe/Istanbul',
]

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('parseCityDataset', () => {
  it('сохраняет компактные tuple schema 3 без материализации объектов', () => {
    const tuples = [istanbul]
    const parsed = parseCityDataset({ schemaVersion: 3, source, cities: tuples })

    expect(parsed.cities).toBe(tuples)
    expect(parsed.cities[0]).toBe(istanbul)
    expect(searchCities(parsed, 'Стамбул')[0]).toEqual({
      id: 745044,
      name: 'Стамбул',
      countryCode: 'TR',
      admin1Code: '34',
      latitude: 41.0138,
      longitude: 28.9497,
      population: 15_701_602,
      timeZone: 'Europe/Istanbul',
    })
  })

  it('отклоняет старую схему и неподдерживаемую таймзону', () => {
    expect(() => parseCityDataset({ schemaVersion: 2, source, cities: [] }))
      .toThrow('неизвестный формат')

    const invalidTimeZone = [...istanbul] as CompactCityRecord
    invalidTimeZone[8] = 'Mars/Olympus'
    expect(() => parseCityDataset({
      schemaVersion: 3,
      source,
      cities: [invalidTimeZone],
    })).toThrow('неизвестный формат')
  })

  it('отклоняет пустой или ненормализованный поисковый ключ', () => {
    const emptyKey = [...istanbul] as CompactCityRecord
    emptyKey[2] = ''
    const rawKey = [...istanbul] as CompactCityRecord
    rawKey[2] = 'Стамбул İstanbul'

    expect(() => parseCityDataset({ schemaVersion: 3, source, cities: [emptyKey] }))
      .toThrow('неизвестный формат')
    expect(() => parseCityDataset({ schemaVersion: 3, source, cities: [rawKey] }))
      .toThrow('неизвестный формат')
  })

  it('отклоняет повторяющийся GeoNames ID', () => {
    expect(() => parseCityDataset({
      schemaVersion: 3,
      source,
      cities: [istanbul, [...istanbul]],
    })).toThrow('неизвестный формат')
  })
})

describe('loadCityDataset', () => {
  it('возвращает typed success для schema 3', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ schemaVersion: 3, source, cities: [istanbul] }),
    }))

    const result = await loadCityDataset()

    expect(result).toEqual({
      ok: true,
      value: { source, cities: [istanbul] },
    })
  })

  it.each([
    [false, 'offline'],
    [true, 'unavailable'],
  ] as const)(
    'классифицирует сетевой сбой при onLine=%s как %s',
    async (online, reason) => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online)
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')))

      await expect(loadCityDataset()).resolves.toEqual({
        ok: false,
        error: { kind: 'data', reason },
      })
    },
  )

  it('классифицирует HTTP-сбой как unavailable независимо от onLine', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))

    await expect(loadCityDataset()).resolves.toEqual({
      ok: false,
      error: { kind: 'data', reason: 'unavailable' },
    })
  })

  it.each([
    ['сломанный JSON', vi.fn().mockRejectedValue(new SyntaxError('json'))],
    ['невалидную схему', vi.fn().mockResolvedValue({ schemaVersion: 2 })],
  ])('классифицирует %s как invalid', async (_case, json) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json }))

    await expect(loadCityDataset()).resolves.toEqual({
      ok: false,
      error: { kind: 'data', reason: 'invalid' },
    })
  })
})

describe('cityCatalogService failures', () => {
  it('сохраняет structured DataFailure из worker response', async () => {
    class WorkerStub {
      static instance: WorkerStub | undefined

      private listeners = new Map<string, (event: MessageEvent) => void>()

      constructor() {
        WorkerStub.instance = this
      }

      addEventListener(type: string, listener: (event: MessageEvent) => void) {
        this.listeners.set(type, listener)
      }

      postMessage(request: { id: number }) {
        this.listeners.get('message')?.({
          data: {
            id: request.id,
            ok: false,
            error: { kind: 'data', reason: 'offline' },
          },
        } as MessageEvent)
      }

      terminate() {}

      failTransport() {
        this.listeners.get('error')?.({} as MessageEvent)
      }
    }
    vi.stubGlobal('Worker', WorkerStub)

    await expect(cityCatalogService.load()).resolves.toEqual({
      ok: false,
      error: { kind: 'data', reason: 'offline' },
    })
    const worker = WorkerStub.instance
    if (!worker) throw new Error('Не создан тестовый worker')
    worker.failTransport()
  })

  it('возвращает unavailable, если worker transport не создаётся', async () => {
    function UnavailableWorker() {
      throw new Error('worker unavailable')
    }
    vi.stubGlobal('Worker', UnavailableWorker)

    await expect(cityCatalogService.load()).resolves.toEqual({
      ok: false,
      error: { kind: 'data', reason: 'unavailable' },
    })
  })
})
