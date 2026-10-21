import { describe, expect, it } from 'vitest'
import { required } from '../test/required'
import { createCityPlace, createOfficialPlace, createGpsPlace, withNearbyCity } from './place'
import { migrateRecentPlaces, rememberPlace, restoreRecentPlaces, updateRecentPlace } from './recentPlaces'

const official = (id: string, longitude = 49) => createOfficialPlace({ id, name: id, latitude: 55, longitude }, 10)
const city = (id: number, longitude = 49) => createCityPlace({ id, name: 'Одинаковое имя', countryCode: 'RU', admin1Code: '73', admin1Name: 'Татарстан', latitude: 55, longitude, population: 1, timeZone: 'Europe/Moscow' }, 10)
const gps = (latitude: number, longitude: number, timestamp: number, name = '', accuracy = 20) => ({
  ...createGpsPlace({ latitude, longitude, accuracy, timestamp }, 'Europe/Moscow', null, `gps:operation:${timestamp}`), name,
})

describe('recentPlaces', () => {
  it('promotes one city or official identity and preserves equal labels with distinct IDs and types', () => {
    const existing = [official('b'), city(1), official('a')]
    expect(rememberPlace(existing, official('b')).map(place => place.id)).toEqual(['locality:b', 'geonames:1', 'locality:a'])
    const sameLabel = rememberPlace([official('same')], city(9))
    expect(sameLabel.map(place => place.id)).toEqual(['geonames:9', 'locality:same'])
  })

  it('groups GPS only within 500m and chooses the nearest match before recency', () => {
    const a = required(restoreRecentPlaces([gps(55, 49, 1, 'Казань')])[0])
    const b = gps(55, 49.004, 2, 'Казань')
    const updated = rememberPlace([a], b)
    expect(updated).toHaveLength(1)
    expect(updated[0]).toMatchObject({ id: a.id, longitude: b.longitude, timestamp: 2 })
    expect(restoreRecentPlaces(updated)[0]?.id).toBe(a.id)
    const distant = gps(55, 49.02, 3, 'Казань')
    expect(rememberPlace(updated, distant)).toHaveLength(2)
  })

  it('does not reuse a moved snapshot ID when a later capture returns to its original coordinates', () => {
    const first = gps(41, 29, 1)
    const saved = required(restoreRecentPlaces([first])[0])
    const refined = { ...gps(41.01, 29.01, 2), id: saved.id }
    const moved = updateRecentPlace([saved], refined, saved.id)
    const returned = rememberPlace(moved, gps(41, 29, 3))

    expect(returned).toHaveLength(2)
    expect(new Set(returned.map(place => place.id)).size).toBe(2)
    expect(returned.map(place => place.timestamp)).toEqual([3, 2])
  })

  it('coalesces GPS entries that become one spatial group after refinement', () => {
    const history = restoreRecentPlaces([gps(41, 29, 1), gps(41, 29.01, 2)])
    expect(history).toHaveLength(2)
    const target = required(history[0])
    const refined = { ...gps(41, 29.005, 3), id: target.id }
    const updated = updateRecentPlace(history, refined, target.id)

    expect(updated).toHaveLength(1)
    expect(updated[0]).toMatchObject({ id: target.id, longitude: 29.005, timestamp: 3 })
    expect(new Set(updated.map(place => place.id)).size).toBe(updated.length)
  })

  it('uses recency to break equal-distance ties and never widens 500m for poor accuracy', () => {
    const older = gps(55, 49, 1)
    const newer = gps(55, 49.012, 2)
    const history = restoreRecentPlaces([newer, older])
    const tied = rememberPlace(history, gps(55, 49.006, 3))
    expect(tied.map(place => place.id)).toEqual([history[0]?.id, history[1]?.id])
    const poor = gps(55, 49, 4, '', 100_000)
    expect(rememberPlace([], poor)).toHaveLength(1)
    expect(rememberPlace([poor], gps(55, 49.02, 5, '', 100_000))).toHaveLength(2)
  })

  it('keeps recalled GPS capture data and timezone policy without promoting on enrichment', () => {
    const saved = required(restoreRecentPlaces([gps(48, 2, 123, 'Paris')])[0])
    const enriched = { ...saved, longitude: 2.0001, timestamp: 999, name: 'Paris updated' }
    const updated = updateRecentPlace([saved], enriched)
    expect(updated).toHaveLength(1)
    expect(updated[0]).toMatchObject({ id: saved.id, longitude: 2.0001, timestamp: 999, name: 'Paris updated', automaticTimeZone: { source: 'device' } })
    expect(updateRecentPlace([], enriched)).toEqual([])
  })

  it('restores current place first, drops invalid/duplicate rows and is idempotent', () => {
    const current = gps(55, 49, 100)
    const recents = migrateRecentPlaces([null, {}, gps(55, 49.001, 90), official('a'), official('a')], current)
    expect(recents.map(place => place.selection === 'gps' ? 'gps' : place.id)).toEqual(['gps', 'locality:a'])
    expect(restoreRecentPlaces(recents)).toEqual(recents)
    expect(restoreRecentPlaces('corrupted')).toEqual([])
  })

  it('migrates legacy manual history without reordering it or replacing an existing GPS snapshot with passive current state', () => {
    const old = [official('one'), city(2), official('three')]
    const activeGps = gps(55, 49.001, 500, 'passive newer name')
    const storedGps = gps(55, 49, 100, 'accepted snapshot')
    const migrated = migrateRecentPlaces([storedGps, ...old], activeGps)
    expect(migrated.map(place => place.id)).toEqual(['gps:history:55.000000:49.000000', 'locality:one', 'geonames:2', 'locality:three'])
    expect(migrated[0]).toMatchObject({ timestamp: 100, name: 'accepted snapshot' })
    expect(restoreRecentPlaces(migrated)).toEqual(migrated)
  })

  it('adds a missing current place once and keeps it inside the ten-entry cap', () => {
    const current = official('current')
    const migrated = migrateRecentPlaces(Array.from({ length: 10 }, (_, index) => official(String(index))), current)
    expect(migrated).toHaveLength(10)
    expect(migrated[0]?.id).toBe('locality:current')
    expect(migrated.some(place => place.id === 'locality:9')).toBe(false)
  })

  it('migrates a missing current GPS snapshot once without changing its capture timestamp', () => {
    const current = gps(41, 29, 9876, '', 120)
    const migrated = migrateRecentPlaces([], current)
    expect(migrated).toHaveLength(1)
    expect(migrated[0]).toMatchObject({ id: 'gps:history:41.000000:29.000000', latitude: 41, longitude: 29, accuracy: 120, timestamp: 9876 })
    expect(restoreRecentPlaces(migrated)).toEqual(migrated)
  })

  it('promotes the active legacy entry once while retaining the other legacy entries in order', () => {
    const history = [official('one'), official('active'), official('three')]
    const migrated = migrateRecentPlaces(history, official('active'))
    expect(migrated.map(place => place.id)).toEqual(['locality:active', 'locality:one', 'locality:three'])
    expect(restoreRecentPlaces(migrated)).toEqual(migrated)
  })

  it('recovers conflicting stable GPS IDs deterministically and keeps all identities unique', () => {
    const first = { ...gps(40, -73, 100), id: 'gps:history:legacy' }
    const far = { ...gps(41, -74, 200), id: 'gps:history:legacy' }
    const malformed = { ...gps(42, -75, 300), latitude: Number.NaN }
    const nearbyFar = { ...gps(41.0001, -74, 250), id: first.id }
    const normalized = restoreRecentPlaces([first, far, malformed, nearbyFar, first])
    expect(normalized).toHaveLength(2)
    expect(normalized.map(place => place.id)).toEqual(['gps:history:legacy', 'gps:history:legacy:recovered:1'])
    expect(new Set(normalized.map(place => place.id)).size).toBe(normalized.length)
    expect(restoreRecentPlaces(normalized)).toEqual(normalized)
  })

  it('repairs cross-type ID collisions in corrupt persisted data', () => {
    const gpsPlace = { ...gps(40, -73, 100), id: 'collision' }
    const officialPlace = { ...official('official'), id: 'gps:history:40.000000:-73.000000' }
    const normalized = restoreRecentPlaces([gpsPlace, officialPlace])
    expect(normalized.map(place => place.id)).toEqual(['gps:history:40.000000:-73.000000', 'gps:history:40.000000:-73.000000:recovered:1'])
    expect(new Set(normalized.map(place => place.id)).size).toBe(normalized.length)
  })

  it('normalizes saved GPS identity independently of transient IDs, timestamps, and names', () => {
    const first = required(restoreRecentPlaces([gps(40, -73, 1, '')])[0])
    const second = required(restoreRecentPlaces([gps(40, -73, 900, 'Different nearby label')])[0])
    expect(first.id).toMatch(/^gps:history:/)
    expect(second.id).toBe(first.id)
  })

  it('keeps ten distinct places and evicts only the oldest on an eleventh selection', () => {
    let places = Array.from({ length: 10 }, (_, index) => official(String(index)))
    places = rememberPlace(places, official('10'))
    expect(places).toHaveLength(10)
    expect(places.map(place => place.id)).toEqual(['locality:10', ...Array.from({ length: 9 }, (_, i) => `locality:${i}`)])
  })

  it('does not treat a nearby city hint as GPS identity', () => {
    const first = withNearbyCity(gps(55, 49, 1), { id: 1, name: 'Same', countryCode: 'RU', admin1Code: '73', admin1Name: 'Tatarstan', latitude: 55, longitude: 49, population: 1, timeZone: 'Europe/Moscow' })
    const far = withNearbyCity(gps(55, 49.02, 2), { id: 1, name: 'Same', countryCode: 'RU', admin1Code: '73', admin1Name: 'Tatarstan', latitude: 55, longitude: 49, population: 1, timeZone: 'Europe/Moscow' })
    expect(rememberPlace([first], far)).toHaveLength(2)
  })
})
