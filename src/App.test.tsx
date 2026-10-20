import { settingsServices, type TestSettingsServices } from './test/settingsServices'
import { automaticPreferences, manualCalculation } from './domain/sourcePreferences'
import { selectionFromSettings } from './domain/calculationSettings'
import geometry from '../public/data/tatarstan-boundary.json'
import { parseCoverageGeometry } from './domain/localGeography'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { App, type AppServices } from './App'
import type { PrayerRepositoryState } from './data/prayerRepository'
import {
  getCountryGroups,
  searchCities,
  type CityDataset,
} from './domain/cities'
import { DEFAULT_CALCULATION_SETTINGS } from './domain/prayerCalculation'
import { createOfficialPlace } from './domain/place'
import { getDatasetRevision, scheduleContextKey, type ScheduleContext } from './domain/scheduleContext'
import { activateFastScheduleContext, FAST_SCHEDULE_STORAGE_KEYS, invalidateFastScheduleSnapshot,
  readFastScheduleSnapshot, writeFastScheduleSnapshot } from './features/schedule/fastScheduleSnapshot'
import { failure, success } from './domain/result'
import type { PrayerDay } from './domain/types'
import { THEME_PREFERENCE_CACHE_KEY } from './ui/themePreferenceCache'

const kazanToday: PrayerDay = {
  locationId: 'kazan',
  date: '2026-09-01',
  fajrStart: '02:21',
  fajrJamaat: '03:17',
  sunrise: '04:48',
  zenith: '11:44',
  dhuhr: '12:00',
  asr: '16:24',
  maghrib: '18:39',
  isha: '20:33',
}

const kazanYesterday: PrayerDay = {
  ...kazanToday,
  date: '2026-08-31',
  fajrJamaat: '03:16',
}

const kazanTomorrow: PrayerDay = {
  ...kazanToday,
  date: '2026-09-02',
  fajrJamaat: '03:19',
  asr: '16:21',
}

const chelnyToday: PrayerDay = {
  ...kazanToday,
  locationId: 'naberezhnye-chelny',
  asr: '16:37',
}

function dumRtDay(locationId: string, date: string): PrayerDay {
  return {
    locationId,
    date,
    fajrStart: '02:00',
    fajrJamaat: '03:00',
    sunrise: '04:30',
    zenith: '11:45',
    dhuhr: '12:00',
    asr: '16:00',
    maghrib: '19:00',
    isha: date === '2026-10-12' ? '23:59' : date === '2026-10-13' ? '20:13'
      : date === '2026-10-31' ? '20:31' : date === '2026-11-01' ? '20:01' : '20:00',
  }
}

const cityDataset: CityDataset = {
  source: {
    name: 'GeoNames',
    url: 'https://www.geonames.org/',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    updatedAt: '2026-08-31',
  },
  cities: [
    [745044, 'Стамбул', ['стамбул', 'истанбул', 'istanbul'], 'TR', '34', 41.0138, 28.9497, 15_701_602, 'Europe/Istanbul', 'Стамбул', 'турция'],
    [524901, 'Москва', ['москва', 'москву', 'moscow'], 'RU', '48', 55.7522, 37.6156, 10_381_222, 'Europe/Moscow', 'Москва', 'россия'],
    [551487, 'Казань', ['казань', 'kazan'], 'RU', '73', 55.7946, 49.1115, 1_308_660, 'Europe/Moscow', 'Татарстан', 'россия татарстан'],
  ],
}

const initializedState = {
  meta: {
    schemaVersion: 2,
    source: {
      name: 'ДУМ Республики Татарстан',
      url: 'https://dumrt.ru/ru/help-info/prayertime/',
      updatedAt: '2025-12-27T10:49:04.000Z',
      years: [2026],
    },
    locations: [
      { id: 'kazan', name: 'Казань', latitude: 55.7946, longitude: 49.1115 },
      {
        id: 'naberezhnye-chelny',
        name: 'Набережные Челны',
        latitude: 55.742,
        longitude: 52.3992,
      },
    ],
  },
  locationChoice: { mode: 'official', locationId: 'kazan', source: 'default' },
  themeFamily: 'classic',
  preferences: automaticPreferences(),
  dataState: 'ready', update: { status: 'idle' }, checkedAt: null,
} satisfies PrayerRepositoryState

function initialized(overrides: Partial<PrayerRepositoryState> & { calculationSettings?: typeof DEFAULT_CALCULATION_SETTINGS } = {}) {
  return success({ ...initializedState, ...overrides, ...(overrides.calculationSettings ? { preferences: manualCalculation(selectionFromSettings(overrides.calculationSettings)) } : {}) })
}

function deferred<Value>() {
  let resolve!: (value: Value) => void
  const promise = new Promise<Value>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

function createServices(
  overrides: Partial<AppServices & TestSettingsServices> = {},
): AppServices & TestSettingsServices {
  const days = [kazanYesterday, kazanToday, kazanTomorrow, chelnyToday]

  return {
    initialize: vi.fn().mockResolvedValue(initialized()),
    cities: {
      load: vi.fn().mockResolvedValue(success({
        source: cityDataset.source,
        countryGroups: getCountryGroups(cityDataset),
      })),
      search: vi.fn().mockImplementation((query: string) =>
        Promise.resolve(success({cities:searchCities(cityDataset, query),status:'complete',missingPackages:[]})),
      ),
      findNearest: vi.fn().mockResolvedValue(success(null)),
    },
    getDays: vi
      .fn()
      .mockImplementation((locationId: string, dates: readonly string[]) =>
        Promise.resolve(success(
          dates.map((date) => days.find((day) => day.locationId === locationId && day.date === date)),
        )),
      ),
    ...settingsServices(overrides),
    refresh: vi.fn().mockResolvedValue(initializedState),
    subscribe: vi.fn(() => () => {}),
    invalidateAndDrain: vi.fn().mockResolvedValue(undefined),
    loadGeography: vi.fn().mockResolvedValue(parseCoverageGeometry(geometry)),
    getPermission: vi.fn().mockResolvedValue('prompt'),
    getPosition: vi.fn().mockResolvedValue(success({
      latitude: 55.742,
      longitude: 52.3992,
      accuracy: 500,
      timestamp: 1_788_265_600_000,
    })),
    getDeviceTimeZone: () => 'Europe/Moscow',
    getCalculationProfileCapability: () => ({ supported: true }),
    now: () => new Date('2026-09-01T10:00:00.000Z'),
    ...overrides,
  }
}

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: key => { values.delete(key) },
    clear: () => values.clear(),
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size },
  }
}

function seedStartupSnapshot(services: AppServices, appVersion = 'warm-test', includeNeighbors = false) {
  const location = initializedState.meta.locations.find(item => item.id === 'kazan')
  if (!location) throw new Error('Kazan test location is missing')
  const selectedPlace = createOfficialPlace(location, services.now().getTime())
  const context: ScheduleContext = {
    location: { id: selectedPlace.id, latitude: selectedPlace.latitude, longitude: selectedPlace.longitude },
    date: '2026-09-01', timeZone: 'Europe/Moscow', mode: 'automatic', source: 'official',
    provider: 'dumRt', datasetRevision: getDatasetRevision(initializedState.meta), datasetVersion: initializedState.meta.source.updatedAt,
    coverage: 'RU-TA', localityId: 'kazan',
  }
  const schedule = { ...kazanToday, timeZone: context.timeZone,
    coordinates: { latitude: selectedPlace.latitude, longitude: selectedPlace.longitude } }
  const generation = invalidateFastScheduleSnapshot()
  if (!generation || !activateFastScheduleContext(scheduleContextKey(context), generation)) {
    throw new Error('Could not activate the test cache')
  }
  if (!writeFastScheduleSnapshot({ appVersion, now: services.now(), deviceTimeZone: services.getDeviceTimeZone(),
    generation, context, schedule, place: selectedPlace, selectionSource: 'default', preferences: automaticPreferences(),
    meta: initializedState.meta, ...(includeNeighbors ? { neighbors: [kazanYesterday, kazanTomorrow].map(day => ({ ...day, timeZone: context.timeZone, coordinates: schedule.coordinates })) } : {}) })) throw new Error('Could not write the test cache')
  return context
}

describe('Salah', () => {
  beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()))
  afterEach(() => vi.unstubAllGlobals())

  it('рисует проверенный однодневный снимок до завершения IndexedDB и дополняет контекст отдельно', async () => {
    const localStore = memoryStorage()
    vi.stubGlobal('localStorage', localStore)
    const initialization = deferred<Awaited<ReturnType<AppServices['initialize']>>>()
    const neighbors = deferred<Awaited<ReturnType<AppServices['getDays']>>>()
    const services = createServices({
      initialize: vi.fn(() => initialization.promise),
      getDays: vi.fn<AppServices['getDays']>((_id, dates) => dates.length === 2 ? neighbors.promise : Promise.resolve(success([]))),
    })
    seedStartupSnapshot(services)

    render(<App services={services} version="warm-test" />)
    const list = screen.getByRole('list', { name: 'Расписание дня' })
    expect(within(list).getByText('16:24')).toBeVisible()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()

    await act(async () => { neighbors.resolve(success([kazanYesterday, kazanTomorrow])); await neighbors.promise })
    expect(await screen.findByRole('timer', { name: /До Асра/ })).toBeVisible()
    await act(async () => { initialization.resolve(initialized()); await initialization.promise })
    await expectSchedule()
  })

  it('сохраняет проверенное расписание и даёт повторить неудачную инициализацию', async () => {
    const localStore = memoryStorage()
    vi.stubGlobal('localStorage', localStore)
    const services = createServices({
      initialize: vi.fn().mockResolvedValueOnce(failure({ kind: 'storage', reason: 'unavailable' })).mockResolvedValue(initialized()),
    })
    seedStartupSnapshot(services)
    render(<App services={services} version="warm-test" />)

    expect(within(screen.getByRole('list', { name: 'Расписание дня' })).getByText('16:24')).toBeVisible()
    const recovery = await screen.findByRole('alert')
    await userEvent.click(within(recovery).getByRole('button', { name: 'Повторить' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(within(screen.getByRole('list', { name: 'Расписание дня' })).getByText('16:24')).toBeVisible()
  })

  it('сводит внешнее место, активный маркер и расписание вместе', async () => {
    const localStore = memoryStorage()
    vi.stubGlobal('localStorage', localStore)
    const remote = initialized({ locationChoice: { mode: 'official', locationId: 'naberezhnye-chelny', source: 'manual' } })
    const services = createServices({
      initialize: vi.fn().mockResolvedValueOnce(initialized()).mockResolvedValue(remote),
    })
    render(<App services={services} />)
    await screen.findByRole('timer')

    const generation = invalidateFastScheduleSnapshot()
    await act(async () => { window.dispatchEvent(new StorageEvent('storage', { key: FAST_SCHEDULE_STORAGE_KEYS.activeContext })); await Promise.resolve() })
    await waitFor(() => expect(services.initialize).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('button', { name: 'Набережные Челны' })).toBeVisible()
    expect(await screen.findByText('16:37')).toBeVisible()
    expect(screen.queryByText('16:24')).not.toBeInTheDocument()
    await waitFor(() => {
      const marker = JSON.parse(localStore.getItem(FAST_SCHEDULE_STORAGE_KEYS.activeContext) ?? 'null') as { generation: string; contextKey: string | null }
      const snapshotRaw = localStore.getItem(FAST_SCHEDULE_STORAGE_KEYS.snapshot)
      expect(snapshotRaw).not.toBeNull()
      const envelope = JSON.parse(snapshotRaw ?? 'null') as { payload: string }
      const snapshot = JSON.parse(envelope.payload) as { generation: string; context: ScheduleContext; place: { id: string } }
      expect(marker).toMatchObject({ generation, contextKey: scheduleContextKey(snapshot.context) })
      expect(snapshot).toMatchObject({ generation, place: { id: 'locality:naberezhnye-chelny' }, context: { location: { id: 'locality:naberezhnye-chelny' } } })
    })
  })

  it('не позволяет запоздалой межвкладочной синхронизации перезаписать свой выбор', async () => {
    const localStore = memoryStorage()
    vi.stubGlobal('localStorage', localStore)
    const remote = deferred<Awaited<ReturnType<AppServices['initialize']>>>()
    const initialize = vi.fn().mockImplementation(() => initialize.mock.calls.length === 1 ? Promise.resolve(initialized()) : remote.promise)
    const saveSettings = vi.fn<AppServices['saveSettings']>().mockResolvedValue(success(undefined))
    const services = createServices({ initialize, saveSettings })
    render(<App services={services} />)
    await screen.findByRole('timer')

    invalidateFastScheduleSnapshot()
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: FAST_SCHEDULE_STORAGE_KEYS.activeContext }))
      window.dispatchEvent(new StorageEvent('storage', { key: FAST_SCHEDULE_STORAGE_KEYS.changeSignal }))
      await Promise.resolve()
    })
    await waitFor(() => expect(initialize).toHaveBeenCalledTimes(2))
    await chooseCity('Москва', /Москва/)
    expect(await screen.findByRole('button', { name: 'Москва' })).toBeVisible()
    expect(saveSettings.mock.lastCall?.[0]).toMatchObject({ locationChoice: { mode: 'calculated', coordinates: { cityId: 524901 } } })
    await act(async () => { remote.resolve(initialized({ locationChoice: { mode: 'official', locationId: 'naberezhnye-chelny', source: 'manual' } })); await remote.promise })
    expect(screen.getByRole('button', { name: 'Москва' })).toBeVisible()
    expect(initialize).toHaveBeenCalledTimes(2)
    await waitFor(() => {
      const marker = JSON.parse(localStore.getItem(FAST_SCHEDULE_STORAGE_KEYS.activeContext) ?? 'null') as { contextKey: string | null }
      const envelope = JSON.parse(localStore.getItem(FAST_SCHEDULE_STORAGE_KEYS.snapshot) ?? 'null') as { payload: string }
      const snapshot = JSON.parse(envelope.payload) as { context: ScheduleContext; place: { id: string } }
      expect(marker.contextKey).toBe(scheduleContextKey(snapshot.context))
      expect(snapshot.place.id).toBe('geonames:524901')
    })
  })

  it('не отменяет ожидающую внешнюю смену места при приходе темы из другой вкладки', async () => {
    const localStore = memoryStorage()
    vi.stubGlobal('localStorage', localStore)
    const remote = deferred<Awaited<ReturnType<AppServices['initialize']>>>()
    const remoteState: PrayerRepositoryState = { ...initialized({
      locationChoice: { mode: 'official', locationId: 'naberezhnye-chelny', source: 'manual' },
    }).value }
    delete remoteState.themeFamily
    const initialize = vi.fn().mockImplementation(() => initialize.mock.calls.length === 1
      ? Promise.resolve(initialized()) : remote.promise)
    const saveSettings = vi.fn<AppServices['saveSettings']>().mockResolvedValue(success(undefined))
    render(<App services={createServices({ initialize, saveSettings })} />)
    await screen.findByRole('timer')

    invalidateFastScheduleSnapshot()
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: FAST_SCHEDULE_STORAGE_KEYS.activeContext })) })
    await waitFor(() => expect(initialize).toHaveBeenCalledTimes(2))

    const value = JSON.stringify({ version: 1, themeFamily: 'seasonal' })
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: THEME_PREFERENCE_CACHE_KEY, newValue: value })) })
    expect(document.documentElement.dataset.theme).toBe('seasonal')
    await act(async () => { remote.resolve(success(remoteState)); await remote.promise })

    expect(await screen.findByRole('button', { name: 'Набережные Челны' })).toBeVisible()
    expect(await screen.findByText('16:37')).toBeVisible()
    expect(document.documentElement.dataset.theme).toBe('seasonal')
  })

  it('сбрасывает устаревшее место из очереди записи после внешней синхронизации', async () => {
    const localStore = memoryStorage()
    vi.stubGlobal('localStorage', localStore)
    const externalState = initialized({ locationChoice: { mode: 'official', locationId: 'naberezhnye-chelny', source: 'manual' } })
    const saveSettings = vi.fn<AppServices['saveSettings']>().mockResolvedValue(success(undefined))
    const services = createServices({
      initialize: vi.fn().mockResolvedValueOnce(initialized()).mockResolvedValue(externalState),
      saveSettings,
    })
    render(<App services={services} />)
    await screen.findByRole('timer')

    await chooseCity('Москва', /Москва/)
    await waitFor(() => expect(saveSettings).toHaveBeenCalled())
    invalidateFastScheduleSnapshot()
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: FAST_SCHEDULE_STORAGE_KEYS.activeContext }))
      await Promise.resolve()
    })
    expect(await screen.findByRole('button', { name: 'Набережные Челны' })).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: 'Выбрать дату' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Календарь' }), 'hijri')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Поправка даты' }), '1')
    await waitFor(() => expect(saveSettings.mock.lastCall?.[0]).toHaveProperty('calendarPreferences'))
    expect(saveSettings.mock.lastCall?.[0]).not.toHaveProperty('locationChoice')
  })

  it('показывает ошибку внешней синхронизации и даёт повторить её без старого расписания', async () => {
    const localStore = memoryStorage()
    vi.stubGlobal('localStorage', localStore)
    const services = createServices({
      initialize: vi.fn().mockResolvedValueOnce(initialized())
        .mockResolvedValueOnce(failure({ kind: 'storage', reason: 'unavailable' }))
        .mockResolvedValue(initialized({ locationChoice: { mode: 'official', locationId: 'naberezhnye-chelny', source: 'manual' } })),
    })
    render(<App services={services} />)
    await screen.findByRole('timer')

    invalidateFastScheduleSnapshot()
    await act(async () => { window.dispatchEvent(new StorageEvent('storage', { key: FAST_SCHEDULE_STORAGE_KEYS.activeContext })); await Promise.resolve() })
    const recovery = await screen.findByRole('alert')
    expect(screen.queryByRole('list', { name: 'Расписание дня' })).not.toBeInTheDocument()
    await userEvent.click(within(recovery).getByRole('button', { name: 'Повторить' }))

    expect(await screen.findByRole('button', { name: 'Набережные Челны' })).toBeVisible()
    expect(await screen.findByText('16:37')).toBeVisible()
    expect(screen.queryByText('16:24')).not.toBeInTheDocument()
  })

  it('заменяет тёплый снимок после гидратации новой revision официального набора', async () => {
    const localStore = memoryStorage()
    vi.stubGlobal('localStorage', localStore)
    const initialization = deferred<Awaited<ReturnType<AppServices['initialize']>>>()
    const updatedMeta = {
      ...initializedState.meta,
      source: { ...initializedState.meta.source, updatedAt: '2026-09-02T00:00:00.000Z' },
    }
    const updatedRevision = getDatasetRevision(updatedMeta)
    const services = createServices({
      initialize: vi.fn(() => initialization.promise),
      getDays: vi.fn<AppServices['getDays']>((id, dates, revision) => Promise.resolve(success(dates.map(date => {
        const day = [kazanYesterday, kazanToday, kazanTomorrow].find(candidate => candidate.locationId === id && candidate.date === date)
        return day && revision === updatedRevision ? { ...day, asr: '16:25' } : day
      })))),
    })
    seedStartupSnapshot(services)
    render(<App services={services} version="warm-test" />)
    const list = screen.getByRole('list', { name: 'Расписание дня' })
    expect(within(list).getByText('16:24')).toBeVisible()
    expect(await screen.findByRole('timer', { name: /До Асра/ })).toBeVisible()

    await act(async () => { initialization.resolve(initialized({ meta: updatedMeta })); await initialization.promise })
    expect(await screen.findByText('16:25')).toBeVisible()
    expect(screen.queryByText('16:24')).not.toBeInTheDocument()
    await waitFor(() => expect(readFastScheduleSnapshot({ appVersion: 'warm-test', now: services.now(),
      deviceTimeZone: services.getDeviceTimeZone() })).toMatchObject({
      context: { datasetRevision: updatedRevision }, schedule: { asr: '16:25' },
    }))
  })

  it('игнорирует необязательные настройки, прочитанные до успешного сброса', async () => {
    localStorage.setItem(THEME_PREFERENCE_CACHE_KEY, JSON.stringify({ version: 1, themeFamily: 'classic' }))
    const optional = deferred<Awaited<ReturnType<NonNullable<AppServices['loadOptionalSettings']>>>>()
    const clearAppData = vi.fn().mockResolvedValue(success(undefined))
    const loadOptionalSettings = vi.fn(() => optional.promise)
    const startupState: PrayerRepositoryState = { ...initializedState }
    delete startupState.themeFamily
    render(<App services={createServices({
      initializeStartup: vi.fn().mockResolvedValue(success(startupState)),
      loadOptionalSettings, clearAppData,
    })} />)
    await screen.findByRole('timer')
    await waitFor(() => expect(loadOptionalSettings).toHaveBeenCalledTimes(1))

    await userEvent.click(screen.getByRole('button', { name: 'Настройки' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Данные и конфиденциальность' }))
    await userEvent.click(screen.getByRole('button', { name: 'Удалить данные' }))
    await userEvent.click(screen.getByRole('button', { name: 'Удалить данные' }))
    await waitFor(() => expect(clearAppData).toHaveBeenCalledTimes(1))
    expect(localStorage.getItem(THEME_PREFERENCE_CACHE_KEY)).toBeNull()

    await act(async () => {
      optional.resolve(success({ recentPlaces: [], calendarPreferences: { calendar: 'hijri', correction: 1 },
        themeFamily: 'seasonal', languagePreference: 'ru', fastingMode: { manualEnabled: true } }))
      await optional.promise
    })
    expect(localStorage.getItem(THEME_PREFERENCE_CACHE_KEY)).toBeNull()
    expect(document.documentElement.dataset.theme).toBe('classic')
  })

  it('автоматически сохраняет параметры, повторяет неудачную запись и сохраняет старые поправки', async () => {
    const initial = manualCalculation({ profile: 'karachi', overrides: { fajrAngle: 19 } })
    const saveSettings = vi.fn().mockResolvedValueOnce(failure({ kind: 'storage', reason: 'unavailable' })).mockResolvedValue(success(undefined))
    const services = createServices({ initialize: vi.fn().mockResolvedValue(initialized({ preferences: initial })), saveSettings })
    render(<App services={services} />)
    await screen.findByRole('timer', { name: /До Асра/ })
    await userEvent.click(await screen.findByRole('button', { name: 'Настройки' }))
    await userEvent.click(screen.getByRole('button', { name: /Расписание/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Параметры' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Аср' }), 'standard')
    expect(await screen.findByRole('status')).toBeVisible()
    await userEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Повторить' }))
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    expect(saveSettings).toHaveBeenLastCalledWith({ sourcePreferences: manualCalculation({ profile: 'karachi', overrides: { fajrAngle: 19, asrMethod: 'standard' } }) }, expect.any(Function))
    await userEvent.click(screen.getByRole('button', { name: 'Назад' }))
    await userEvent.click(screen.getByRole('button', { name: 'Параметры' }))
    expect(screen.getByRole('combobox', { name: 'Аср' })).toHaveValue('standard')
  })

  it('завершает поиск одним тапом и сохраняет предыдущий город в недавних', async () => {
    const services = createServices()
    render(<App services={services} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Казань' }))
    await userEvent.click(screen.getByRole('button', { name: 'Найти город' }))
    await userEvent.type(screen.getByRole('searchbox'), 'Москва')
    await userEvent.click(await screen.findByRole('button', { name: /Москва/ }))
    expect(await screen.findByRole('region', { name: 'Главная' })).toBeVisible()
    await waitFor(() => expect(services.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ recentPlaces: [expect.objectContaining({ id: 'locality:kazan' })] }), expect.any(Function)))
    await userEvent.click(screen.getByRole('button', { name: /Москва/ }))
    const recent = screen.getByRole('region', { name: 'Недавние города' })
    await userEvent.click(within(recent).getByRole('button', { name: 'Казань' }))
    expect(await screen.findByRole('button', { name: 'Казань' })).toBeVisible()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('переключает календарь без смены дня, применяет поправку и выбирает дату сразу', async () => {
    const services = createServices()
    render(<App services={services} />)
    await screen.findByRole('timer')
    await userEvent.click(screen.getByRole('button', { name: 'Выбрать дату' }))
    expect(screen.queryByRole('button', { name: 'Сегодня' })).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Календарь' }), 'hijri')
    expect(screen.getByRole('combobox', { name: 'День' })).toHaveValue('19')
    expect(screen.getByRole('combobox', { name: 'Месяц' })).toHaveValue('3')
    expect(screen.getByRole('combobox', { name: 'Год' })).toHaveValue('1448')
    expect(screen.queryByRole('button', { name: 'Готово' })).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Поправка даты' }), '1')
    expect(screen.getByRole('combobox', { name: 'День' })).toHaveValue('20')
    expect(screen.queryByRole('button', { name: 'Сегодня' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Назад' }))
    expect(await screen.findByRole('timer')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Выбрать дату' })).toHaveAccessibleDescription(/раби аль-авваль/)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Выбрать дату' })).toHaveFocus())
    await userEvent.click(screen.getByRole('button', { name: 'Выбрать дату' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'День' }), '21')
    expect(screen.getByRole('button', { name: 'Сегодня' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Назад' }))
    expect(await screen.findByRole('list')).toHaveTextContent('16:21')
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Выбрать дату' }))
    await userEvent.click(screen.getByRole('button', { name: 'Сегодня' }))
    expect(screen.queryByRole('button', { name: 'Сегодня' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'День' })).toHaveFocus()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Календарь' }), 'gregorian')
    expect(screen.getByRole('combobox', { name: 'День' })).toHaveValue('1')
    expect(screen.queryByRole('combobox', { name: 'Поправка даты' })).not.toBeInTheDocument()
    await waitFor(() => expect(services.saveSettings).toHaveBeenLastCalledWith({ calendarPreferences: { calendar: 'gregorian', correction: 1 } }, expect.any(Function)))
  })

  it('сохраняет автоактивацию текущей ночи Рамадана при просмотре другой даты', async () => {
    const services = createServices({
      now: () => new Date('2026-02-17T18:30:00.000Z'),
      getDays: vi.fn((locationId: string, dates: readonly string[]) => Promise.resolve(success(
        dates.map(date => dumRtDay(locationId, date)),
      ))),
    })
    render(<App services={services} />)

    await screen.findByRole('list', { name: 'Расписание дня' })
    expect(screen.getByRole('progressbar')).toBeVisible()
    await chooseGregorianDate('2026-03-01')
    await userEvent.click(screen.getByRole('button', { name: 'Настройки' }))

    expect(screen.getByRole('switch', { name: 'Режим поста' })).toHaveAttribute('aria-checked', 'true')
  })

  it.each(['manual'] as const)(
    'не запрашивает позицию для сохранённого выбора с источником %s',
    async (source) => {
      const services = createServices({
        initialize: vi.fn().mockResolvedValue(initialized({
          locationChoice: {
            mode: 'official',
            locationId: 'naberezhnye-chelny',
            source,
          },
        })),
        getPermission: vi.fn().mockResolvedValue('granted'),
      })

      render(<App services={services} />)

      expect(await screen.findByRole('button', { name: /Набережные Челны/ })).toBeVisible()
      await waitFor(() => expect(services.initialize).toHaveBeenCalledTimes(1))
      expect(services.getPermission).not.toHaveBeenCalled()
      expect(services.getPosition).not.toHaveBeenCalled()
    },
  )

  it('обновляет на старте только ранее автоматический выбор', async () => {
    const services = createServices({
      initialize: vi.fn().mockResolvedValue(initialized({
        locationChoice: {
          mode: 'official',
          locationId: 'kazan',
          source: 'automatic',
        },
      })),
      getPermission: vi.fn().mockResolvedValue('granted'),
    })

    render(<App services={services} />)

    expect(await screen.findByRole('button', { name: '55.7420, 52.3992' })).toBeVisible()
    expect(services.getPermission).toHaveBeenCalledTimes(1)
    expect(services.getPosition).toHaveBeenNthCalledWith(1, 'coarse')
    expect(services.getPosition).toHaveBeenNthCalledWith(2, 'precise')
    expect(services.saveOfficialLocation).toHaveBeenCalledWith(
      'naberezhnye-chelny',
      'automatic',
      expect.objectContaining({ selection: 'gps' }),
      expect.any(Function),
    )
    expect(services.cities.load).not.toHaveBeenCalled()
    expect(services.cities.search).not.toHaveBeenCalled()
    expect(services.cities.findNearest).toHaveBeenCalledWith(55.742, 52.3992, 25, true)
  })

  it('показывает весь день и выделяет текущее событие после готовности соседних событий', async () => {
    render(<App services={createServices()} />)
    expect(await screen.findByRole('timer')).toBeVisible()
    expect((await screen.findByText('Зухр', { exact: true })).closest('li')).toHaveAttribute('aria-current', 'true')
    expect(screen.queryByRole('button', { name: 'Расписание' })).not.toBeInTheDocument()
    await expectSchedule()
    const list = screen.getByRole('list', { name: 'Расписание дня' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(8)
    expect(within(list).getByText('Зухр').closest('li')).toHaveAttribute('aria-current', 'true')
    expect(within(list).getByText('Аср').closest('li')).not.toHaveAttribute('aria-current')
  })

  it('обновляет событие после возвращения из фона', async () => {
    let now = new Date('2026-09-01T13:23:59Z')
    render(<App services={createServices({ now: () => now })} />)
    expect(await screen.findByRole('timer', { name: /До Асра/ })).toBeVisible()
    act(() => { now = new Date('2026-09-01T13:24:00Z'); window.dispatchEvent(new Event('pageshow')) })
    expect((await screen.findByText('Аср', { exact: true })).closest('li')).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('timer', { name: /До Магриба/ })).toBeVisible()
  })

  it('считает по часовому поясу города, а не устройства', async () => {
    render(<App services={createServices({ initialize: vi.fn().mockResolvedValue(initialized({ locationChoice: {
      mode: 'calculated', source: 'manual', coordinates: { latitude: 41.0138, longitude: 28.9497, timeZone: 'Europe/Istanbul', accuracy: null, timestamp: 1, name: 'Стамбул', cityId: 745044, source: 'preset' },
    } })), getDeviceTimeZone: () => 'America/Los_Angeles' })} />)
    await screen.findByRole('list', { name: 'Расписание дня' })
    await expectSchedule()
    expect(within(screen.getByRole('list')).getByText('04:53')).toBeVisible()
    expect(homeDate()).toHaveAttribute('datetime', '2026-09-01')
    expect(screen.getByRole('button', { name: /Стамбул/ })).toBeVisible()
  })

  it('переключает сегодняшний день по московской полуночи, сохраняя выбранную чужую дату', async () => {
    let now = new Date('2026-08-31T20:59:59Z')
    const services = createServices({ now: () => now, getDeviceTimeZone: () => 'America/Los_Angeles' })
    render(<App services={services} />)
    await screen.findByRole('button', { name: /Казань/ })
    expect(homeDate()).toHaveAttribute('datetime', '2026-08-31')
    await userEvent.click(screen.getByRole('button', { name: 'Выбрать дату' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Месяц' }), '9')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'День' }), '2')
    await userEvent.click(screen.getByRole('button', { name: 'Назад' }))
    await screen.findByRole('list')
    act(() => { now = new Date('2026-08-31T21:00:00Z'); window.dispatchEvent(new Event('pageshow')) })
    expect(homeDate()).toHaveAttribute('datetime', '2026-09-02')
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Сегодня' }))
    expect(await screen.findByRole('timer')).toBeVisible()
    expect(homeDate()).toHaveAttribute('datetime', '2026-09-01')
  })

  it('показывает строку ДУМ РТ по московской дате, когда GPS-устройство ещё на предыдущем дне', async () => {
    const services = await showGpsKazan('America/Los_Angeles', '2026-10-12T21:30:00Z')

    expect(homeDate()).toHaveAttribute('datetime', '2026-10-13')
    const list = screen.getByRole('list', { name: 'Расписание дня' })
    expect(within(list).getByText('20:13')).toBeVisible()
    expect(within(list).queryByText('23:59')).not.toBeInTheDocument()
    expect(screen.getByRole('timer')).toBeVisible()
    expect(services.getDays).toHaveBeenCalledWith('kazan', expect.arrayContaining(['2026-10-13']), expect.any(String), 'dumRt')
  })

  it('первый запуск не выбирает город и не запрашивает GPS сам', async () => {
    const services = createServices({ initialize: vi.fn().mockResolvedValue(initialized({ locationChoice: null })) })
    render(<App services={services} />)
    expect(await screen.findByRole('heading', { name: 'Выберите место' })).toBeVisible()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(services.getPosition).not.toHaveBeenCalled()
    expect(services.refresh).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Найти город' }))
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(screen.getByRole('heading', { name: 'Выберите место' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'По геопозиции' }))
    expect(await screen.findByRole('region', { name: 'Главная' })).toBeVisible()
    expect(services.getPosition).toHaveBeenCalledTimes(2)
  })

  it('возвращает фокус между отдельными экранами с клавиатуры', async () => {
    render(<App services={createServices()} />)
    const location = await screen.findByRole('button', { name: 'Казань' })
    await userEvent.click(location)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Назад' })).toHaveFocus())
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Казань' })).toHaveFocus())
    await userEvent.click(screen.getByRole('button', { name: 'Казань' }))
    await userEvent.click(screen.getByRole('button', { name: 'Найти город' }))
    expect(screen.getByRole('searchbox')).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Найти город' })).toHaveFocus())
    expect(screen.getAllByRole('region', { name: 'Локация' })).toHaveLength(1)
    expect(screen.queryByRole('region', { name: 'Главная' })).not.toBeInTheDocument()
  })

  it('GPS внутри Татарстана использует ближайший опубликованный пункт', async () => {
    const services = createServices()
    render(<App services={services} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Казань' }))
    await userEvent.click(screen.getByRole('button', { name: 'По геопозиции' }))
    await screen.findByRole('button', { name: '55.7420, 52.3992' })
    await expectSchedule()
    expect(within(await screen.findByRole('list')).getByText('16:37')).toBeVisible()
    expect(services.getPosition).toHaveBeenCalledTimes(2)
    expect(services.cities.findNearest).toHaveBeenCalledWith(55.742, 52.3992, 25, false)
    expect(services.saveOfficialLocation).toHaveBeenCalledWith('naberezhnye-chelny', 'automatic', expect.objectContaining({ selection: 'gps' }), expect.any(Function))
  })

  it('восстанавливается после смены неподдерживаемого профиля', async () => {
    const services = createServices({ initialize: vi.fn().mockResolvedValue(initialized({ preferences: manualCalculation({ profile: 'ummAlQura', overrides: {} }) })), getCalculationProfileCapability: profile => profile === 'ummAlQura' ? { supported: false, reason: 'ummAlQuraUnavailable' } : { supported: true } })
    render(<App services={services} />)
    expect(await screen.findByRole('alert')).toBeVisible()
    await openSource()
    await userEvent.click(screen.getByRole('button', { name: /Профиль/ }))
    expect(screen.getByRole('button', { name: /Умм аль-Кура/ })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Карачи' }))
    await backHomeFromSource()
    expect(await screen.findByRole('timer')).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('выбор города сохраняет ручной способ, а Авто возвращает официальную таблицу', async () => {
    const services = createServices({ initialize: vi.fn().mockResolvedValue(initialized({ preferences: manualCalculation({ profile: 'karachi', overrides: {} }) })) })
    render(<App services={services} />)
    await screen.findByRole('timer')
    await chooseCity('Челны', /Набережные Челны.*ДУМ РТ/)
    await expectSchedule()
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(7)
    await openSource()
    expect(screen.getByRole('button', { name: 'Способ Ручной' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Способ Ручной' }))
    await userEvent.click(screen.getByRole('button', { name: 'Автоматически' }))
    await backHomeFromSource()
    await expectSchedule()
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(8)
  })

  it('расчётный холодный старт не ждёт зависшего обновления официальной таблицы', async () => {
    const services = createServices({ initialize: vi.fn().mockResolvedValue(initialized({ meta: null, dataState: 'not-loaded' })), refresh: vi.fn<AppServices['refresh']>(() => new Promise(() => {})) })
    render(<App services={services} />)
    await screen.findByRole('button', { name: 'Казань' })
    await chooseCity('Стамбул', /Стамбул, Стамбул, Турция/)
    expect(await screen.findByRole('timer')).toBeVisible()
    await expectSchedule()
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(7)
    expect(services.getDays).not.toHaveBeenCalled()
    expect(services.refresh).toHaveBeenCalled()
  })

  it.each([automaticPreferences(), { mode: 'manual', source: { kind: 'official', provider: 'dumRt' } } as const])('различает отсутствие таблицы в автоматическом и ручном режиме', async preferences => {
    render(<App services={createServices({ initialize: vi.fn().mockResolvedValue(initialized({ preferences })) })} />)
    await screen.findByRole('button', { name: 'Казань' })
    await userEvent.click(screen.getByRole('button', { name: 'Выбрать дату' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Год' }), '2027')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Месяц' }), '1')
    await userEvent.click(screen.getByRole('button', { name: 'Назад' }))
    if (preferences.mode === 'automatic') expect(await screen.findByRole('list')).toBeVisible()
    else {
      expect(await screen.findByRole('alert')).toBeVisible()
      expect(screen.queryByRole('list')).not.toBeInTheDocument()
    }
  })

  it('применяет системную тему и меняет её без перезагрузки независимо от расписания', async () => {
    let listener: ((event: MediaQueryListEvent) => void) | undefined
    const media = {
      matches: false,
      addEventListener: (_type: string, callback: (event: MediaQueryListEvent) => void) => { listener = callback },
      removeEventListener: () => undefined,
    }
    vi.stubGlobal('matchMedia', () => media)
    const view = render(<App services={createServices()} />)
    await waitFor(() => expect(document.documentElement.dataset.themeTone).toBe('light'))
    act(() => { listener?.({ matches: true } as MediaQueryListEvent) })
    await waitFor(() => expect(document.documentElement.dataset.themeTone).toBe('dark'))
    view.unmount()
    vi.unstubAllGlobals()
  })

  it('применяет закешированное семейство в первом React-коммите до ответа IndexedDB', async () => {
    localStorage.setItem(THEME_PREFERENCE_CACHE_KEY, JSON.stringify({ version: 1, themeFamily: 'seasonal' }))
    const initialization = deferred<Awaited<ReturnType<AppServices['initialize']>>>()
    const services = createServices({ initialize: vi.fn(() => initialization.promise) })
    render(<App services={services} />)

    expect(document.documentElement.dataset.theme).toBe('seasonal')
    expect(document.documentElement.dataset.season).toBe('autumn')
    await act(async () => { initialization.resolve(initialized({ themeFamily: 'classic' })); await initialization.promise })
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('classic'))
  })

  it('заменяет локальную тему внешней и сохраняет прочую ожидающую настройку', async () => {
    const staleWrite = deferred<Awaited<ReturnType<AppServices['saveSettings']>>>()
    const saveSettings = vi.fn<AppServices['saveSettings']>()
      .mockReturnValueOnce(staleWrite.promise)
      .mockResolvedValue(success(undefined))
    render(<App services={createServices({ initialize: vi.fn().mockResolvedValue(initialized({ themeFamily: 'seasonal' })), saveSettings })} />)
    await screen.findByRole('button', { name: 'Казань' })
    await userEvent.click(screen.getByRole('button', { name: 'Настройки' }))
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Тема' }), 'classic')
    await userEvent.click(screen.getByRole('switch'))
    await waitFor(() => expect(saveSettings).toHaveBeenCalledTimes(1))

    const value = JSON.stringify({ version: 1, themeFamily: 'seasonal' })
    localStorage.setItem(THEME_PREFERENCE_CACHE_KEY, value)
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: THEME_PREFERENCE_CACHE_KEY, newValue: value })) })
    expect(document.documentElement.dataset.theme).toBe('seasonal')
    expect(saveSettings.mock.calls[0]?.[1]?.()).toBe(false)

    staleWrite.resolve(success(undefined))
    await waitFor(() => expect(saveSettings).toHaveBeenCalledTimes(2))
    expect(saveSettings.mock.calls[1]?.[0]).toMatchObject({ themeFamily: 'seasonal', fastingMode: { manualEnabled: true } })
    await waitFor(() => expect(JSON.parse(localStorage.getItem(THEME_PREFERENCE_CACHE_KEY) ?? 'null')).toEqual({ version: 1, themeFamily: 'seasonal' }))
  })

  it('сверяет тему через BroadcastChannel, если localStorage недоступен', async () => {
    let receive: ((event: MessageEvent) => void) | null = null
    class TestBroadcastChannel {
      onmessage: ((event: MessageEvent) => void) | null = null
      constructor(name: string) { if (name === 'salah-theme-preference-v1') receive = event => this.onmessage?.(event) }
      postMessage = vi.fn()
      close = vi.fn()
    }
    vi.stubGlobal('BroadcastChannel', TestBroadcastChannel)
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new DOMException('denied', 'SecurityError') },
      setItem: () => { throw new DOMException('denied', 'SecurityError') },
      removeItem: () => { throw new DOMException('denied', 'SecurityError') },
    })
    const initialize = vi.fn().mockResolvedValue(initialized({ themeFamily: 'classic' }))
    const saveSettings = vi.fn().mockResolvedValue(success(undefined))
    render(<App services={createServices({ initialize, saveSettings })} />)
    await screen.findByRole('button', { name: 'Казань' })

    act(() => { receive?.({ data: 'seasonal' } as MessageEvent) })

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('seasonal'))
    await waitFor(() => expect(saveSettings).toHaveBeenCalledWith({ themeFamily: 'seasonal' }, expect.any(Function)))
    expect(initialize).toHaveBeenCalledTimes(1)
  })

  it('применяет сезон текущего дня, а не открытой даты, и сохраняет выбор без reload', async () => {
    const saveSettings = vi.fn().mockResolvedValue(success(undefined))
    render(<App services={createServices({ initialize: vi.fn().mockResolvedValue(initialized({ themeFamily: 'seasonal' })), saveSettings })} />)
    await waitFor(() => expect(document.documentElement.dataset.themeTone).toBe('light'))
    expect(document.documentElement.dataset.season).toBe('autumn')

    await userEvent.click(screen.getByRole('button', { name: 'Выбрать дату' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Месяц' }), '1')
    await userEvent.click(screen.getByRole('button', { name: 'Назад' }))
    expect(document.documentElement.dataset.season).toBe('autumn')

    await userEvent.click(screen.getByRole('button', { name: 'Настройки' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Тема' }), 'classic')
    expect(document.documentElement.dataset.theme).toBe('classic')
    expect(saveSettings).toHaveBeenCalledWith({ themeFamily: 'classic' }, expect.any(Function))
  })

  it('кеширует семейство только после успешного сохранения и после retry', async () => {
    localStorage.setItem(THEME_PREFERENCE_CACHE_KEY, JSON.stringify({ version: 1, themeFamily: 'seasonal' }))
    const saveSettings = vi.fn<AppServices['saveSettings']>()
      .mockResolvedValueOnce(failure({ kind: 'storage', reason: 'unavailable' }))
      .mockResolvedValue(success(undefined))
    render(<App services={createServices({ initialize: vi.fn().mockResolvedValue(initialized({ themeFamily: 'seasonal' })), saveSettings })} />)
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('seasonal'))
    await userEvent.click(screen.getByRole('button', { name: 'Настройки' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Тема' }), 'classic')

    expect(document.documentElement.dataset.theme).toBe('classic')
    await screen.findByRole('button', { name: /Повторить/ })
    expect(JSON.parse(localStorage.getItem(THEME_PREFERENCE_CACHE_KEY) ?? 'null')).toEqual({ version: 1, themeFamily: 'seasonal' })

    await userEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Повторить' }))
    await waitFor(() => expect(JSON.parse(localStorage.getItem(THEME_PREFERENCE_CACHE_KEY) ?? 'null')).toEqual({ version: 1, themeFamily: 'classic' }))
  })

})

function homeDate() {
  const value = screen.getByRole('button', { name: 'Выбрать дату' }).querySelector('time')
  if (!value) throw new Error('Главная дата расписания не отображается')
  return value
}

async function chooseGregorianDate(date: string) {
  const [year, month, day] = date.split('-')
  await userEvent.click(screen.getByRole('button', { name: 'Выбрать дату' }))
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Год' }), String(Number(year)))
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Месяц' }), String(Number(month)))
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'День' }), String(Number(day)))
  await userEvent.click(screen.getByRole('button', { name: 'Назад' }))
  await screen.findByRole('list', { name: 'Расписание дня' })
}

async function showGpsKazan(deviceTimeZone: string, currentInstant: string) {
  const now = new Date(currentInstant)
  const services = createServices({
    initialize: vi.fn().mockResolvedValue(initialized({ locationChoice: null })),
    getDeviceTimeZone: () => deviceTimeZone,
    getPosition: vi.fn().mockResolvedValue(success({
      latitude: 55.7946,
      longitude: 49.1115,
      accuracy: 50,
      timestamp: now.getTime(),
    })),
    now: () => new Date(now),
    getDays: vi.fn((_locationId: string, dates: readonly string[]) => Promise.resolve(success(
      dates.map(date => dumRtDay('kazan', date)),
    ))),
  })
  render(<App services={services} />)
  await userEvent.click(await screen.findByRole('button', { name: 'По геопозиции' }))
  await screen.findByRole('button', { name: '55.7946, 49.1115' })
  await screen.findByRole('list', { name: 'Расписание дня' })
  return services
}

async function expectSchedule() {
  expect(await screen.findByRole('list', { name: 'Расписание дня' })).toBeVisible()
}
async function openSource() {
  await userEvent.click(await screen.findByRole('button', { name: 'Настройки' }))
  await userEvent.click(screen.getByRole('button', { name: /^Расписание/ }))
}
async function backHomeFromSource() {
  await userEvent.click(screen.getByRole('button', { name: 'Назад' }))
  await waitFor(() => expect(screen.getByRole('button', { name: /^Расписание/ })).toHaveFocus())
  await userEvent.click(screen.getByRole('button', { name: 'Назад' }))
  await screen.findByRole('region', { name: 'Главная' })
}
async function chooseCity(query: string, result: string | RegExp, current: string | RegExp = 'Казань') {
  await userEvent.click(screen.getByRole('button', { name: current }))
  await userEvent.click(screen.getByRole('button', { name: 'Найти город' }))
  await userEvent.type(screen.getByRole('searchbox'), query)
  await userEvent.click(await screen.findByRole('button', { name: result }))
  await screen.findByRole('region', { name: 'Главная' })
}
