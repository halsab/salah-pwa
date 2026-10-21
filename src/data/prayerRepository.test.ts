import { required } from '../test/required'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { completeDataset } from '../test/prayerDataset'
import { createCityPlace, createGpsPlace, createOfficialPlace } from '../domain/place'
import { getDatasetRevision } from '../domain/scheduleContext'
import { getDeviceTimeZone } from '../domain/locationTime'
import { success } from '../domain/result'
import { automaticPreferences, manualCalculation } from '../domain/sourcePreferences'
import { clearAppData, deleteSalahDatabase, getLocationChoice, getSetting, replaceDataset, saveLocationChoice, setSetting, type LocationChoice } from '../storage/database'
import * as database from '../storage/database'
import { createPrayerRepository, initializePrayerRepository, initializePrayerRepositoryStartup, loadPrayerRepositoryOptionalSettings } from './prayerRepository'

const dataset = completeDataset()
const repo = createPrayerRepository()
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); await deleteSalahDatabase() })

describe('local initialization and persistence', () => {
  it('loads the selected source identity without scanning the full prayer dataset', async () => {
    await replaceDataset(dataset, { version: 'startup', sha256: 'b'.repeat(64), url: 'prayer-times-current.json' })
    const storedDataset = vi.spyOn(database, 'getStoredDataset')

    const state = await initializePrayerRepositoryStartup()
    expect(state).toMatchObject({ ok: true, value: { dataState: 'ready', meta: { schemaVersion: dataset.schemaVersion } } })
    expect(storedDataset).not.toHaveBeenCalled()
    if (!state.ok || !state.value.meta) throw new Error('Startup metadata fixture was not restored')
    expect(await repo.getDays('kazan', [dataset.days[0]?.date ?? '2026-01-01'], getDatasetRevision(state.value.meta))).toMatchObject({ ok: true })
  })

  it('hydrates optional settings after the critical startup identity', async () => {
    const previous = createOfficialPlace(required(dataset.locations[0]), 0)
    await repo.saveSettings({ recentPlaces: [previous], themeFamily: 'seasonal', languagePreference: 'ru', fastingMode: { manualEnabled: true } })

    const startup = await initializePrayerRepositoryStartup()
    expect(startup).toMatchObject({ ok: true })
    if (!startup.ok) throw new Error('Critical startup initialization failed')
    expect(startup.value.themeFamily).toBeUndefined()

    expect(await loadPrayerRepositoryOptionalSettings()).toMatchObject({ ok: true, value: {
      recentPlaces: [previous], themeFamily: 'seasonal', languagePreference: 'ru', fastingMode: { manualEnabled: true },
    } })
  })

  it('uses identical normalization for deferred and full optional-settings hydration', async () => {
    const recent = createOfficialPlace(required(dataset.locations[0]), 0)
    const calendarPreferences = { calendar: 'hijri', correction: 1 } as const
    const fastingMode = { manualEnabled: true }
    await repo.saveSettings({ recentPlaces: [recent], calendarPreferences, themeFamily: 'seasonal', languagePreference: 'ru', fastingMode })

    const full = await initializePrayerRepository()
    if (!full.ok) throw new Error('Full repository initialization failed')
    const optional = await loadPrayerRepositoryOptionalSettings()
    if (!optional.ok) throw new Error('Optional settings hydration failed')

    expect(optional.value).toEqual({
      recentPlaces: full.value.recentPlaces, recentPlacesMigrated: false,
      calendarPreferences: full.value.calendarPreferences,
      themeFamily: full.value.themeFamily,
      languagePreference: full.value.languagePreference,
      fastingMode: full.value.fastingMode,
    })
  })

  it('restores, validates and resets the theme family without using legacy appearance', async () => {
    await setSetting('appearance', 'light')
    expect(await initializePrayerRepository()).toMatchObject({ value: { themeFamily: 'classic' } })
    expect(await repo.saveSettings({ themeFamily: 'seasonal' })).toEqual(success(undefined))
    expect(await initializePrayerRepository()).toMatchObject({ value: { themeFamily: 'seasonal' } })
    expect(await repo.saveSettings({ themeFamily: 'invalid' as import('../domain/theme').ThemeFamily })).toMatchObject({ ok: false, error: { kind: 'data' } })
    await setSetting('themeFamily', 'invalid' as import('../domain/theme').ThemeFamily)
    expect(await initializePrayerRepository()).toMatchObject({ value: { themeFamily: 'classic' } })
    await clearAppData()
    expect(await initializePrayerRepository()).toMatchObject({ value: { themeFamily: 'classic' } })
  })
  it.each([1, 2])('classifies a stored legacy schema %s dataset as ready after normalization', async (schemaVersion) => {
    const legacy = {
      ...dataset,
      schemaVersion,
      days: dataset.days.map(({ fajrStart, ...day }) => ({ ...day, suhurEnd: fajrStart })),
    } as unknown as typeof dataset
    await replaceDataset(legacy, { version: 'legacy', sha256: 'a'.repeat(64), url: 'prayer-times-current.json' })
    expect(await initializePrayerRepository()).toMatchObject({ value: { dataState: 'ready', meta: { schemaVersion } } })
  })

  it('сохраняет календарь с поправкой и возвращает исходный выбор после сброса', async () => {
    const calendarPreferences = { calendar: 'hijri', correction: 1 } as const
    expect(await repo.saveSettings({ calendarPreferences })).toEqual(success(undefined))
    expect(await initializePrayerRepository()).toMatchObject({ value: { calendarPreferences } })
    await clearAppData()
    expect(await initializePrayerRepository()).toMatchObject({ value: { calendarPreferences: { calendar: 'gregorian', correction: 0 } } })
  })
  it('сохраняет ручной режим и подавление одного периода Рамадана, сбрасывая их вместе с данными', async () => {
    const fastingMode = { manualEnabled: false, suppressedRamadanOccurrence: 'ramadan-1448' as const }
    expect(await initializePrayerRepository()).toMatchObject({ value: { fastingMode: { manualEnabled: false } } })
    expect(await repo.saveSettings({ fastingMode })).toEqual(success(undefined))
    expect(await initializePrayerRepository()).toMatchObject({ value: { fastingMode } })
    expect(await repo.saveSettings({ fastingMode: { manualEnabled: true } })).toEqual(success(undefined))
    expect(await initializePrayerRepository()).toMatchObject({ value: { fastingMode: { manualEnabled: true } } })
    expect(await repo.saveSettings({ fastingMode: { manualEnabled: false, suppressedRamadanOccurrence: 'invalid' } as never }))
      .toMatchObject({ ok: false, error: { kind: 'data' } })
    await clearAppData()
    expect(await initializePrayerRepository()).toMatchObject({ value: { fastingMode: { manualEnabled: false } } })
  })
  it('сохраняет выбор языка без изменения версии базы и восстанавливает auto по умолчанию', async () => {
    expect(await initializePrayerRepository()).toMatchObject({ value: { languagePreference: 'auto' } })
    expect(await repo.saveSettings({ languagePreference: 'ru' })).toEqual(success(undefined))
    expect(await initializePrayerRepository()).toMatchObject({ value: { languagePreference: 'ru' } })
    expect(await repo.saveSettings({ languagePreference: 'en' as unknown as import('../localization/locale').LanguagePreference }))
      .toMatchObject({ ok: false, error: { kind: 'data' } })
    await clearAppData()
    expect(await initializePrayerRepository()).toMatchObject({ value: { languagePreference: 'auto' } })
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
  it('persists validated GPS history snapshots in the existing settings value', async () => {
    const place = createGpsPlace({ latitude: 55.79, longitude: 49.12, accuracy: 20, timestamp: 100 }, 'Europe/Moscow', null, 'gps:history:test')
    expect(await repo.saveSettings({ recentPlaces: [place] })).toMatchObject({ ok: true })
    expect(await initializePrayerRepository()).toMatchObject({ value: { recentPlaces: [expect.objectContaining({ selection: 'gps', latitude: 55.79, timestamp: 100 })] } })
  })
  it('persists the one-time history migration marker with settings and clears it on reset', async () => {
    const place = createOfficialPlace(required(dataset.locations[0]), 0)
    expect(await repo.saveSettings({ recentPlaces: [place], recentPlacesMigrated: true })).toMatchObject({ ok: true })
    expect(await loadPrayerRepositoryOptionalSettings()).toMatchObject({ value: { recentPlaces: [place], recentPlacesMigrated: true } })
    await clearAppData()
    expect(await loadPrayerRepositoryOptionalSettings()).toMatchObject({ value: { recentPlaces: [], recentPlacesMigrated: false } })
  })
  it('atomically persists an early explicit selection with the migrated full legacy history', async () => {
    const previousCurrent = createOfficialPlace(required(dataset.locations[0]), 10)
    const legacyHistory = Array.from({ length: 10 }, (_, index) => index === 2
      ? previousCurrent
      : createOfficialPlace({ id: `legacy-${index}`, name: `Legacy ${index}`, latitude: 35 + index, longitude: 20 + index }, index))
    const selected = createCityPlace({ id: 524901, name: 'Москва', countryCode: 'RU', admin1Code: '48', admin1Name: 'Москва', latitude: 55.7522,
      longitude: 37.6156, population: 1000, timeZone: 'Europe/Moscow' }, 20)
    const selectedEarlier = createCityPlace({ id: 1, name: 'Берлин', countryCode: 'DE', admin1Code: '16', admin1Name: 'Берлин', latitude: 52.5,
      longitude: 13.4, population: 1000, timeZone: 'Europe/Berlin' }, 15)
    const choice: LocationChoice = { mode: 'calculated', coordinates: selected, place: selected, source: 'manual' }
    await saveLocationChoice({ mode: 'official', locationId: 'kazan', source: 'manual' })
    await setSetting('recentPlaces', legacyHistory)

    expect(await repo.saveSettings({ locationChoice: choice, placeEvents: [selectedEarlier, selected].map((place, index) => ({ change: 'selection', choice: { mode: 'calculated', source: 'manual', coordinates: place, place }, selectionOrder: index + 1 })) })).toEqual(success(undefined))
    expect(await initializePrayerRepositoryStartup()).toMatchObject({ value: { locationChoice: { mode: 'calculated', place: { id: selected.id } } } })
    const optional = await loadPrayerRepositoryOptionalSettings()
    if (!optional.ok) throw new Error('History read after selection failed')
    const expectedIds = [
      'geonames:524901', 'geonames:1', 'locality:kazan', 'locality:legacy-0', 'locality:legacy-1',
      'locality:legacy-3', 'locality:legacy-4', 'locality:legacy-5', 'locality:legacy-6', 'locality:legacy-7',
    ]
    expect(optional.value.recentPlaces.map(place => place.id)).toEqual(expectedIds)
    expect(optional.value.recentPlacesMigrated).toBe(true)

    // Повторный старт читает уже согласованные choice/history и не повторяет миграцию.
    expect(await initializePrayerRepositoryStartup()).toMatchObject({ value: { locationChoice: { mode: 'calculated', place: { id: selected.id } } } })
    const restartedHistory = await loadPrayerRepositoryOptionalSettings()
    expect(restartedHistory).toMatchObject({ value: { recentPlaces: optional.value.recentPlaces, recentPlacesMigrated: true } })
  })
  it('migrates the original active place before a passive refresh without recording that refresh', async () => {
    const previous = createGpsPlace({ latitude: 41.01, longitude: 28.95, accuracy: 80, timestamp: 10 }, 'Europe/Moscow', null, 'gps:legacy-current')
    const passive = createGpsPlace({ latitude: 40, longitude: -73, accuracy: 30, timestamp: 20 }, 'America/New_York', null, 'gps:passive:20')
    await saveLocationChoice({ mode: 'calculated', coordinates: previous, place: previous, source: 'automatic' })
    await repo.saveSettings({ locationChoice: { mode: 'calculated', coordinates: passive, place: passive, source: 'automatic' } })

    const optional = await loadPrayerRepositoryOptionalSettings()
    expect(optional).toMatchObject({ ok: true, value: { recentPlacesMigrated: true,
      recentPlaces: [expect.objectContaining({ selection: 'gps', timestamp: previous.timestamp, accuracy: previous.accuracy,
        latitude: previous.latitude, longitude: previous.longitude })] } })
    if (!optional.ok) throw new Error('History read after passive refresh failed')
    expect(optional.value.recentPlaces.some(place => place.timestamp === passive.timestamp || place.latitude === passive.latitude)).toBe(false)
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
  it('keeps an explicit selection write failure retryable as one consistent settings snapshot', async () => {
    const selected = createOfficialPlace(required(dataset.locations[0]), 100)
    const choice: LocationChoice = { mode: 'official', locationId: selected.id.replace('locality:', ''), source: 'manual', place: selected }
    const patch: import('../storage/database').SettingsPatch = { locationChoice: choice, placeEvents: [{ change: 'selection', choice, selectionOrder: 1 }] }
    vi.stubGlobal('indexedDB', { open: () => { throw new Error('disabled') } })
    expect(await repo.saveSettings(patch)).toMatchObject({ ok: false, error: { kind: 'storage' } })
    vi.unstubAllGlobals()
    await deleteSalahDatabase()

    expect(await repo.saveSettings(patch)).toEqual(success(undefined))
    expect(await initializePrayerRepositoryStartup()).toMatchObject({ value: { locationChoice: { place: { id: selected.id } } } })
    expect(await loadPrayerRepositoryOptionalSettings()).toMatchObject({ value: { recentPlaces: [expect.objectContaining({ id: selected.id })], recentPlacesMigrated: true } })
  })
  it('rejects explicit persistence events without a pre-queue selection order', async () => {
    const selected = createOfficialPlace(required(dataset.locations[0]), 100)
    const choice: LocationChoice = { mode: 'official', locationId: selected.id.replace('locality:', ''), source: 'manual', place: selected }
    expect(await repo.saveSettings({ locationChoice: choice, placeEvents: [{ change: 'selection', choice }] }))
      .toMatchObject({ ok: false, error: { kind: 'data', reason: 'invalid' } })
    expect(await getLocationChoice()).toMatchObject({ value: undefined })
  })
})
