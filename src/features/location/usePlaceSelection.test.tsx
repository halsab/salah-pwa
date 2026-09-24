import { settingsServices, type TestSettingsServices } from '../../test/settingsServices'
import { createSettingsPersistence } from '../settings/settingsPersistence'
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { usePlaceSelection } from './usePlaceSelection'
import type { AppServices } from '../../App'
import { success, failure } from '../../domain/result'
import { createGpsPlace, setPlaceTimeZone } from '../../domain/place'
import { parseCoverageGeometry } from '../../domain/localGeography'
import geometryData from '../../../public/data/tatarstan-boundary.json'
import type { City } from '../../domain/cities'

const geometry = parseCoverageGeometry(geometryData)
const locations = [{ id: 'kazan', name: 'Казань', latitude: 55.79, longitude: 49.12 }]
const coarseFix = { latitude: 55.79, longitude: 49.12, accuracy: 1200, timestamp: 100 }
const goodCoarseFix = { ...coarseFix, accuracy: 500 }
const preciseFix = { ...coarseFix, latitude: 55.8, accuracy: 10, timestamp: 200 }
const poorPreciseFix = { ...coarseFix, latitude: 55.791, accuracy: 1100, timestamp: 200 }
const city: City = { id: 1, name: 'Berlin', countryCode: 'DE', admin1Code: '16', admin1Name: 'Berlin', latitude: 52.52, longitude: 13.4, population: 1, timeZone: 'Europe/Berlin' }
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { resolve, promise }
}
function setup(overrides: Partial<AppServices & TestSettingsServices> = {}) {
  const coarse = deferred<Awaited<ReturnType<AppServices['getPosition']>>>()
  const precise = deferred<Awaited<ReturnType<AppServices['getPosition']>>>()
  const lookup = deferred<Awaited<ReturnType<AppServices['cities']['findNearest']>>>()
  const services = {
    loadGeography: vi.fn().mockResolvedValue(geometry),
    getPosition: vi.fn((accuracy: string) => accuracy === 'coarse' ? coarse.promise : precise.promise),
    getPermission: vi.fn().mockResolvedValue('granted'),
    getDeviceTimeZone: () => 'America/Los_Angeles', now: () => new Date(1000),
    cities: { findNearest: vi.fn().mockReturnValue(lookup.promise) },
    ...settingsServices(overrides),
    ...overrides,
  } as unknown as AppServices & TestSettingsServices
  const chosen = vi.fn()
  const writer = createSettingsPersistence(services.saveSettings)
  const persist = (choice: Parameters<typeof writer.save>[0]['locationChoice']) => writer.save(choice ? { locationChoice: choice } : {})
  const hook = renderHook(() => usePlaceSelection(services, locations, chosen, persist))
  return { ...hook, services, coarse, precise, lookup, chosen }
}

describe('one-shot GPS operations', () => {
  it('publishes a poor coarse point and waits for precise refinement before navigation', async () => {
    const h = setup()
    let pending!: Promise<void>
    act(() => { pending = h.result.current.locate() })
    await act(async () => { h.coarse.resolve(success(coarseFix)); await Promise.resolve() })
    expect(h.result.current.place).toMatchObject({ ...coarseFix, coverage: 'inside', timeZone: 'Europe/Moscow' })
    expect(h.result.current.gpsState).toEqual({ status: 'refining' })
    expect(h.chosen).not.toHaveBeenCalled()
    expect(h.services.saveOfficialLocation).toHaveBeenCalledWith('kazan', 'automatic', expect.objectContaining(coarseFix), expect.any(Function))
    const id = h.result.current.place?.id
    await act(async () => { h.precise.resolve(success(preciseFix)); await pending })
    expect(h.result.current.place).toMatchObject({ ...preciseFix, id })
    expect(h.result.current.gpsState).toEqual({ status: 'ready', lowAccuracy: false })
    expect(h.chosen).toHaveBeenCalledOnce()
  })
  it('finishes once after a sufficiently accurate coarse point while precise continues', async () => {
    const h = setup()
    let pending!: Promise<void>
    act(() => { pending = h.result.current.locate() })
    await act(async () => { h.coarse.resolve(success(goodCoarseFix)); await Promise.resolve() })
    expect(h.result.current.gpsState).toEqual({ status: 'ready', lowAccuracy: false })
    expect(h.chosen).toHaveBeenCalledOnce()
    await act(async () => { h.precise.resolve(success(preciseFix)); await pending })
    expect(h.chosen).toHaveBeenCalledOnce()
  })
  it('keeps a final low-accuracy point available for explicit acceptance', async () => {
    const h = setup()
    let pending!: Promise<void>
    act(() => { pending = h.result.current.locate() })
    await act(async () => { h.coarse.resolve(success(coarseFix)); h.precise.resolve(success(poorPreciseFix)); await pending })
    expect(h.result.current.place).toMatchObject(coarseFix)
    expect(h.result.current.gpsState).toEqual({ status: 'ready', lowAccuracy: true })
    expect(h.chosen).not.toHaveBeenCalled()
    act(() => h.result.current.acceptGps())
    expect(h.chosen).toHaveBeenCalledOnce()
  })
  it('accepts provisional coarse once and still applies a late useful precise point', async () => {
    const h = setup()
    let pending!: Promise<void>
    act(() => { pending = h.result.current.locate() })
    await act(async () => { h.coarse.resolve(success(coarseFix)); await Promise.resolve() })
    act(() => h.result.current.acceptGps())
    expect(h.chosen).toHaveBeenCalledOnce()
    await act(async () => { h.precise.resolve(success(preciseFix)); await pending })
    expect(h.result.current.place).toMatchObject(preciseFix)
    expect(h.chosen).toHaveBeenCalledOnce()
  })
  it('ignores late coarse after precise and never replaces GPS coordinates with city coordinates', async () => {
    const h = setup()
    let pending!: Promise<void>
    act(() => { pending = h.result.current.locate() })
    await act(async () => { h.precise.resolve(success(preciseFix)); await Promise.resolve() })
    await act(async () => { h.coarse.resolve(success(coarseFix)); await pending })
    expect(h.result.current.place).toMatchObject(preciseFix)
    await act(async () => { h.lookup.resolve(success({ ...city, name: 'Казань', latitude: 55.79, longitude: 49.12, timeZone: 'Europe/Samara' })); await Promise.resolve() })
    expect(h.result.current.place).toMatchObject({ ...preciseFix, timeZone: 'Europe/Moscow', name: 'Рядом: Казань' })
  })
  it('retains useful coarse when precise fails', async () => {
    const h = setup()
    let pending!: Promise<void>
    act(() => { pending = h.result.current.locate() })
    await act(async () => { h.coarse.resolve(success(coarseFix)); h.precise.resolve(failure({ kind: 'geolocation', reason: 'timeout' })); await pending })
    expect(h.result.current.place).toMatchObject(coarseFix)
    expect(h.result.current.gpsState).toEqual({ status: 'ready', lowAccuracy: true })
    expect(h.chosen).not.toHaveBeenCalled()
  })
  it('uses deterministic failure priority when both requests fail', async () => {
    const h = setup()
    let pending!: Promise<void>
    act(() => { pending = h.result.current.locate() })
    await act(async () => {
      h.coarse.resolve(failure({ kind: 'geolocation', reason: 'timeout' }))
      h.precise.resolve(failure({ kind: 'geolocation', reason: 'denied' }))
      await pending
    })
    expect(h.result.current.gpsState).toEqual({ status: 'error', reason: 'denied' })
    expect(h.result.current.place).toBeNull()
  })
  it('treats one valid fix and one error as a successful operation', async () => {
    const h = setup()
    let pending!: Promise<void>
    act(() => { pending = h.result.current.locate() })
    await act(async () => {
      h.coarse.resolve(success(goodCoarseFix))
      h.precise.resolve(failure({ kind: 'geolocation', reason: 'denied' }))
      await pending
    })
    expect(h.result.current.gpsState).toEqual({ status: 'ready', lowAccuracy: false })
    expect(h.chosen).toHaveBeenCalledOnce()
  })
  it('ignores both GPS responses after a manual city and resets override', async () => {
    const h = setup()
    let pending!: Promise<void>
    act(() => { pending = h.result.current.locate() })
    act(() => h.result.current.selectCity(city))
    await act(async () => { h.coarse.resolve(success(coarseFix)); h.precise.resolve(success(preciseFix)); await pending })
    expect(h.result.current.place).toMatchObject({ selection: 'city', timeZone: 'Europe/Berlin' })
    expect(h.services.saveOfficialLocation).not.toHaveBeenCalled()
    expect(h.services.cities.findNearest).not.toHaveBeenCalled()
  })
  it('ignores delayed lookup after manual choice and on unmount', async () => {
    const h = setup()
    let pending!: Promise<void>
    act(() => { pending = h.result.current.locate() })
    await act(async () => { h.coarse.resolve(success(coarseFix)); await Promise.resolve() })
    act(() => h.result.current.selectCity(city))
    await act(async () => { h.lookup.resolve(success(city)); h.precise.resolve(success(preciseFix)); await pending })
    expect(h.result.current.place?.name).toContain('Berlin')
    h.unmount()
    expect(h.services.saveCalculatedLocation).toHaveBeenCalledTimes(1)
  })
  it('allows package loading for interactive lookup and keeps background lookup local-only', async () => {
    const interactive = setup()
    let interactivePending!: Promise<void>
    act(() => { interactivePending = interactive.result.current.locate() })
    await act(async () => { interactive.coarse.resolve(success(goodCoarseFix)); await Promise.resolve() })
    expect(interactive.services.cities.findNearest).toHaveBeenCalledWith(goodCoarseFix.latitude, goodCoarseFix.longitude, 25, false)
    await act(async () => { interactive.precise.resolve(failure({ kind: 'geolocation', reason: 'timeout' })); await interactivePending })

    const background = setup()
    let backgroundPending!: Promise<void>
    act(() => { backgroundPending = background.result.current.locate(false) })
    await act(async () => { background.coarse.resolve(success(goodCoarseFix)); await Promise.resolve() })
    expect(background.services.cities.findNearest).toHaveBeenCalledWith(goodCoarseFix.latitude, goodCoarseFix.longitude, 25, true)
    await act(async () => { background.precise.resolve(failure({ kind: 'geolocation', reason: 'timeout' })); await backgroundPending })
  })
  it.each([
    [success(null), 'not-found'],
    [failure({ kind: 'data' as const, reason: 'offline' as const }), 'offline'],
    [failure({ kind: 'data' as const, reason: 'unavailable' as const }), 'failed'],
  ] as const)('keeps coordinates when name lookup finishes as %s', async (lookupResult, expectedState) => {
    const h = setup()
    let pending!: Promise<void>
    act(() => { pending = h.result.current.locate() })
    await act(async () => { h.coarse.resolve(success(goodCoarseFix)); await Promise.resolve() })
    expect(h.result.current.nameLookupState).toBe('loading')
    await act(async () => { h.lookup.resolve(lookupResult); await Promise.resolve() })
    expect(h.result.current.nameLookupState).toBe(expectedState)
    expect(h.result.current.place).toMatchObject(goodCoarseFix)
    await act(async () => { h.precise.resolve(failure({ kind: 'geolocation', reason: 'timeout' })); await pending })
  })
  it('maps a rejected name lookup to failed without rolling back coordinates', async () => {
    const h = setup()
    h.services.cities.findNearest = vi.fn().mockRejectedValue(new Error('network'))
    let pending!: Promise<void>
    act(() => { pending = h.result.current.locate() })
    await act(async () => { h.coarse.resolve(success(goodCoarseFix)); await Promise.resolve() })
    await waitFor(() => expect(h.result.current.nameLookupState).toBe('failed'))
    expect(h.result.current.place).toMatchObject(goodCoarseFix)
    await act(async () => { h.precise.resolve(failure({ kind: 'geolocation', reason: 'timeout' })); await pending })
  })
  it('ignores responses after unmount without saving', async () => {
    const h = setup()
    let pending!: Promise<void>
    act(() => { pending = h.result.current.locate() })
    h.unmount()
    await act(async () => { h.coarse.resolve(success(coarseFix)); h.precise.resolve(success(preciseFix)); await pending })
    expect(h.services.saveOfficialLocation).not.toHaveBeenCalled()
    expect(h.services.saveCalculatedLocation).not.toHaveBeenCalled()
  })
  it('keeps override across a new GPS request and allows automatic timezone again', async () => {
    const h = setup()
    const saved = setPlaceTimeZone(createGpsPlace(coarseFix, 'UTC', geometry, 'gps:saved'), 'America/New_York')
    act(() => h.result.current.restore({ mode: 'official', locationId: 'kazan', source: 'automatic', place: saved }, locations))
    expect(h.services.getPosition).not.toHaveBeenCalled()
    let pending!: Promise<void>
    act(() => { pending = h.result.current.locate() })
    await act(async () => { h.precise.resolve(success(preciseFix)); h.coarse.resolve(success(coarseFix)); await pending })
    expect(h.result.current.place?.timeZone).toBe('America/New_York')
    await act(async () => { await h.result.current.changeTimeZone(null) })
    expect(h.result.current.place?.timeZone).toBe('Europe/Moscow')
    await act(async () => { await h.result.current.changeTimeZone('Europe/Berlin') })
    act(() => h.result.current.selectCity(city))
    expect(h.result.current.place?.timeZoneOverride).toBeUndefined()
  })
  it('serializes slow saves so the manual choice is persisted last', async () => {
    const save = deferred<Awaited<ReturnType<TestSettingsServices['saveOfficialLocation']>>>()
    const h = setup({ saveOfficialLocation: vi.fn().mockReturnValue(save.promise) })
    act(() => { void h.result.current.locate() })
    await act(async () => { h.coarse.resolve(success(coarseFix)); await Promise.resolve() })
    act(() => h.result.current.selectCity(city))
    expect(h.services.saveCalculatedLocation).not.toHaveBeenCalled()
    await act(async () => { save.resolve(success(undefined)); h.precise.resolve(success(preciseFix)); await Promise.resolve() })
    await waitFor(() => expect(h.services.saveCalculatedLocation).toHaveBeenCalledWith(expect.objectContaining({ cityId: 1 }), 'manual', expect.any(Function)))
  })
  it('uses explicit device fallback when geographic package is unavailable', async () => {
    const h = setup({ loadGeography: vi.fn().mockResolvedValue(null) })
    let pending!: Promise<void>
    act(() => { pending = h.result.current.locate() })
    await act(async () => { h.coarse.resolve(success(coarseFix)); h.precise.resolve(success(preciseFix)); await pending })
    expect(h.result.current.place).toMatchObject({ coverage: 'unavailable', timeZone: 'America/Los_Angeles' })
    expect(h.services.saveOfficialLocation).not.toHaveBeenCalled()
  })
})

it('restores a saved selection during StrictMode effect replay', async () => {
  const { StrictMode } = await import('react')
  const services = { now: () => new Date(1000) } as AppServices & TestSettingsServices
  const chosen = vi.fn()
  const h = renderHook(() => usePlaceSelection(services, locations, chosen, vi.fn()), { wrapper: StrictMode })
  act(() => h.result.current.restore({ mode: 'official', locationId: 'kazan', source: 'manual' }, locations))
  expect(h.result.current.place?.name).toBe('Казань')
})

it('a newer GPS request wins over both callbacks of the previous request', async () => {
  const h = setup()
  let first!: Promise<void>
  act(() => { first = h.result.current.locate() })
  const latest = { latitude: 40.71, longitude: -74.01, accuracy: 10, timestamp: 300 }
  vi.mocked(h.services.getPosition).mockResolvedValue(success(latest))
  await act(async () => { await h.result.current.locate() })
  await act(async () => { h.coarse.resolve(success(coarseFix)); h.precise.resolve(success(preciseFix)); await first })
  expect(h.result.current.place).toMatchObject(latest)
})

it('automatic timezone reset re-evaluates a legacy GPS place using local boundaries', async () => {
  const h = setup()
  act(() => h.result.current.restore({ mode: 'calculated', source: 'manual', coordinates: { ...coarseFix, source: 'gps', timeZone: 'America/Los_Angeles', name: 'Сохранённое имя' } }, locations))
  await act(async () => { await h.result.current.changeTimeZone(null) })
  expect(h.result.current.place).toMatchObject({ timeZone: 'Europe/Moscow', name: 'Сохранённое имя', automaticTimeZone: { source: 'boundary' } })
  expect(h.services.getPosition).not.toHaveBeenCalled()
})
