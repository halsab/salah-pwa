import { describe, expect, it } from 'vitest'
import { createGpsPlace, homePlaceLabel, refineGpsPlace, setPlaceTimeZone, createCityPlace, isFreshGpsPlace, withNearbyCity } from './place'
import { placeFromChoice } from './placeMigration'
import type { CoverageGeometry } from './localGeography'
const geometry: CoverageGeometry = { uncertaintyMeters: 2000, polygons: [[[[49,55],[50,55],[50,56],[49,56],[49,55]]]] }
const position = { latitude: 55.5, longitude: 49.5, accuracy: 1000, timestamp: 100 }
const gps = () => createGpsPlace(position, 'America/Los_Angeles', geometry, 'gps:1')

describe('place identity and timezone', () => {
  it('keeps real coordinates, identity and automatic timezone independent of label', () => {
    const place = gps()
    expect(place).toMatchObject({ id: 'gps:1', selection: 'gps', ...position, timeZone: 'Europe/Moscow', coverage: 'inside' })
    expect(place.name).toBe('')
    expect(homePlaceLabel(place)).toBe('55.5000, 49.5000')
  })
  it('uses a short locality name on home and keeps coordinates as the GPS fallback', () => {
    const named = withNearbyCity(gps(), { id: 1, name: 'Казань', countryCode: 'RU', admin1Code: '73', admin1Name: 'Татарстан', latitude: 55.5, longitude: 49.5, population: 1, timeZone: 'Europe/Moscow' })
    expect(homePlaceLabel(named)).toBe('Казань')
    expect(homePlaceLabel(null)).toBe('Местоположение не определено')
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
  it('keeps valid country identity when GeoNames has no usable subdivision', () => {
    const city = createCityPlace({ id: 2, name: 'Moscow', countryCode: 'RU', admin1Code: '', admin1Name: '', latitude: 55.75, longitude: 37.62, population: 1, timeZone: 'Europe/Moscow' }, 300)
    expect(city.region).toEqual({ code: 'RU', name: '' })
  })
  it('does not construct country evidence from malformed GeoNames country codes', () => {
    const city = createCityPlace({ id: 3, name: 'Unknown', countryCode: 'ru', admin1Code: '73', admin1Name: 'Tatarstan', latitude: 55.75, longitude: 37.62, population: 1, timeZone: 'Europe/Moscow' }, 300)
    expect(city.region).toBeNull()
    expect(city.coverage).toBe('outside')
  })
  it('preserves confirmed saved Tatarstan identity and degrades malformed saved city regions', () => {
    const city = createCityPlace({ id: 4, name: 'Kazan', countryCode: 'RU', admin1Code: '73', admin1Name: 'Tatarstan', latitude: 55.79, longitude: 49.12, population: 1, timeZone: 'Europe/Moscow' }, 300)
    const choice = { mode: 'calculated' as const, source: 'manual' as const, coordinates: city, place: city }
    expect(placeFromChoice(choice, [])?.region?.code).toBe('RU-TA')
    expect(placeFromChoice({ ...choice, place: { ...city, region: { code: 'RU.undefined', name: '' } } }, [])?.region).toBeNull()
  })
  it('refreshes automatic places only after 30 minutes and rejects future timestamps', () => {
    expect(isFreshGpsPlace(gps(), 100 + 29 * 60_000)).toBe(true)
    expect(isFreshGpsPlace(gps(), 100 + 30 * 60_000)).toBe(false)
    expect(isFreshGpsPlace(gps(), 0)).toBe(false)
  })
})
