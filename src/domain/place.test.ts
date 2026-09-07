import { describe, expect, it } from 'vitest'
import { createGpsPlace, refineGpsPlace, setPlaceTimeZone, createCityPlace, isFreshGpsPlace } from './place'
import type { CoverageGeometry } from './localGeography'
const geometry: CoverageGeometry = { uncertaintyMeters: 2000, polygons: [[[[49,55],[50,55],[50,56],[49,56],[49,55]]]] }
const position = { latitude: 55.5, longitude: 49.5, accuracy: 1000, timestamp: 100 }
const gps = () => createGpsPlace(position, 'America/Los_Angeles', geometry, 'gps:1')

describe('place identity and timezone', () => {
  it('keeps real coordinates, identity and automatic timezone independent of label', () => {
    const place = gps()
    expect(place).toMatchObject({ id: 'gps:1', selection: 'gps', ...position, timeZone: 'Europe/Moscow', coverage: 'inside' })
    expect(place.name).toBe('Моё местоположение')
  })
  it('preserves user override through refinement and restores automatic timezone', () => {
    const place = setPlaceTimeZone(gps(), 'America/New_York')
    const refined = refineGpsPlace(place, { ...position, accuracy: 10, timestamp: 200 }, 'UTC', geometry)
    expect(refined.timeZone).toBe('America/New_York')
    expect(refined.timeZoneOverride).toEqual({ id: 'America/New_York', source: 'user' })
    expect(setPlaceTimeZone(refined, null).timeZone).toBe('Europe/Moscow')
    expect(() => setPlaceTimeZone(place, '+03:00')).toThrow()
  })
  it('new manual city resets override, GPS refresh retains it', () => {
    const city = createCityPlace({ id: 1, name: 'Berlin', countryCode: 'DE', admin1Code: '16', admin1Name: 'Berlin', latitude: 52.52, longitude: 13.4, population: 1, timeZone: 'Europe/Berlin' }, 300)
    expect(city.timeZone).toBe('Europe/Berlin')
    expect(city.timeZoneOverride).toBeUndefined()
    expect(city.selection).toBe('city')
  })
  it('refreshes automatic places only after 30 minutes and rejects future timestamps', () => {
    expect(isFreshGpsPlace(gps(), 100 + 29 * 60_000)).toBe(true)
    expect(isFreshGpsPlace(gps(), 100 + 30 * 60_000)).toBe(false)
    expect(isFreshGpsPlace(gps(), 0)).toBe(false)
  })
})
