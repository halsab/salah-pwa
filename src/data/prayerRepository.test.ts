import { required } from '../test/required'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { completeDataset } from '../test/prayerDataset'
import { createCityPlace, createOfficialPlace } from '../domain/place'
import { getDeviceTimeZone } from '../domain/locationTime'
import { success } from '../domain/result'
import { automaticPreferences, manualCalculation } from '../domain/sourcePreferences'
import { clearAppData, deleteSalahDatabase, getLocationChoice, getSetting, replaceDataset, saveLocationChoice, setSetting, type LocationChoice } from '../storage/database'
import { createPrayerRepository, initializePrayerRepository } from './prayerRepository'

const dataset = completeDataset()
const repo = createPrayerRepository()
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); await deleteSalahDatabase() })

describe('local initialization and persistence', () => {
  it('сохраняет календарь с поправкой и возвращает исходный выбор после сброса', async () => {
    const calendarPreferences = { calendar: 'hijri', correction: 1 } as const
    expect(await repo.saveSettings({ calendarPreferences })).toEqual(success(undefined))
    expect(await initializePrayerRepository()).toMatchObject({ value: { calendarPreferences } })
    await clearAppData()
    expect(await initializePrayerRepository()).toMatchObject({ value: { calendarPreferences: { calendar: 'gregorian', correction: 0 } } })
  })
  it('не сохраняет неверную поправку, а повреждённую запись восстанавливает', async () => {
    const invalid = { calendar: 'hijri', correction: 2 } as unknown as import('../domain/calendar').CalendarPreferences
    expect(await repo.saveSettings({ calendarPreferences: invalid })).toMatchObject({ ok: false, error: { kind: 'data' } })
    await setSetting('calendarPreferences', invalid)
    expect(await initializePrayerRepository()).toMatchObject({ value: { calendarPreferences: { calendar: 'gregorian', correction: 0 } } })
  })
  it('starts without a selected place or network access', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    expect(await initializePrayerRepository()).toMatchObject({ ok: true, value: {
      locationChoice: null, recentPlaces: [],
      preferences: { mode: 'automatic' }, meta: null, dataState: 'not-loaded',
    } })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('saves recents atomically with the selected place and clears them on reset', async () => {
    const place = createOfficialPlace(required(dataset.locations[0]), 0)
    const previous = createOfficialPlace({ ...required(dataset.locations[0]), id: 'other', name: 'Другой город' }, 0)
    await repo.saveSettings({ locationChoice: { mode: 'official', locationId: 'kazan', place, source: 'manual' }, recentPlaces: [previous] })
    expect(await initializePrayerRepository()).toMatchObject({ value: { locationChoice: { place }, recentPlaces: [previous] } })
    await clearAppData()
    expect(await initializePrayerRepository()).toMatchObject({ value: { locationChoice: null, recentPlaces: [] } })
  })
  it('rejects GPS history instead of persisting arbitrary coordinates as recent cities', async () => {
    const place = { ...createOfficialPlace(required(dataset.locations[0]), 0), selection: 'gps' as const }
    expect(await repo.saveSettings({ recentPlaces: [place] })).toMatchObject({ ok: false, error: { kind: 'data' } })
  })
  it('restores legacy coordinates with a missing timezone without loading meta', async () => {
    const coordinates = { latitude: 55.75, longitude: 37.62, accuracy: 18, timestamp: 100, name: 'Сохранённое место', source: 'gps' }
    await saveLocationChoice({ mode: 'calculated', source: 'automatic', coordinates } as LocationChoice)
    expect(await initializePrayerRepository()).toMatchObject({ value: { locationChoice: { mode: 'calculated', coordinates: { ...coordinates, timeZone: getDeviceTimeZone() } } } })
  })
  it.each([null, {}, { mode: 'wrong' }, { mode: 'calculated', source: 'manual', coordinates: { latitude: 55, longitude: 37, accuracy: null, timestamp: 1, timeZone: ['Europe/Moscow'] } }])('restores a safe default for malformed stored choice %j', async value => {
    await saveLocationChoice(value as LocationChoice)
    expect(await initializePrayerRepository()).toMatchObject({ value: { locationChoice: { mode: 'official', locationId: 'kazan', source: 'default' } } })
  })
  it('restores saved source and draft independently of the selected place', async () => {
    const place = createOfficialPlace(required(dataset.locations[0]), 0)
    const preferences = manualCalculation({ profile: 'karachi', overrides: { fajrAngle: 19, adjustments: { isha: 90 } } })
    expect(await repo.saveSettings({ locationChoice: { mode: 'official', locationId: 'kazan', place, source: 'manual' }, sourcePreferences: preferences })).toEqual(success(undefined))
    expect(await initializePrayerRepository()).toMatchObject({ value: { preferences } })
    expect(await repo.saveSettings({ sourcePreferences: automaticPreferences(preferences.calculationDraft) })).toEqual(success(undefined))
    expect(await getLocationChoice()).toMatchObject({ value: { place } })
    expect(await getSetting('sourcePreferences')).toMatchObject({ value: { mode: 'automatic', calculationDraft: preferences.calculationDraft } })
  })
  it('saves a calculated city with its timezone and source together', async () => {
    const place = createCityPlace({ id: 1, name: 'Берлин', countryCode: 'DE', admin1Code: '16', latitude: 52.5, longitude: 13.4, population: 100, timeZone: 'Europe/Berlin', admin1Name: 'Берлин' }, 0)
    expect(await repo.saveSettings({ locationChoice: { mode: 'calculated', coordinates: place, place, source: 'manual' } })).toEqual(success(undefined))
    expect(await initializePrayerRepository()).toMatchObject({ value: { locationChoice: { place, source: 'manual' } } })
  })
  it('returns a typed failure for invalid expert settings or place', async () => {
    expect(await repo.saveSettings({ sourcePreferences: { mode: 'manual', source: { kind: 'calculated', calculation: { profile: 'karachi', overrides: { fajrAngle: NaN } } } } })).toMatchObject({ ok: false, error: { kind: 'data' } })
    expect(await repo.saveSettings({ locationChoice: { mode: 'calculated', coordinates: {} } as LocationChoice })).toMatchObject({ ok: false, error: { kind: 'data' } })
  })
  it('classifies corrupt local data separately from missing data', async () => {
    await replaceDataset({ ...dataset, days: dataset.days.slice(1) }, { version: 'legacy', sha256: 'a'.repeat(64), url: 'prayer-times-current.json' })
    expect(await initializePrayerRepository()).toMatchObject({ value: { meta: null, dataState: 'invalid' } })
  })
  it('returns Result failure when IndexedDB rejects opening or writing', async () => {
    vi.stubGlobal('indexedDB', { open: () => { throw new Error('disabled') } })
    expect(await initializePrayerRepository()).toMatchObject({ ok: false, error: { kind: 'storage' } })
    expect(await repo.saveSettings({ sourcePreferences: automaticPreferences() })).toMatchObject({ ok: false, error: { kind: 'storage' } })
  })
})
