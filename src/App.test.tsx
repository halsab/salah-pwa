import { settingsServices, type TestSettingsServices } from './test/settingsServices'
import { automaticPreferences, manualCalculation } from './domain/sourcePreferences'
import { selectionFromSettings } from './domain/calculationSettings'
import geometry from '../public/data/tatarstan-boundary.json'
import { parseCoverageGeometry } from './domain/localGeography'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { App, type AppServices } from './App'
import type { GeolocationPermission } from './platform/browser'
import type { PrayerRepositoryState } from './data/prayerRepository'
import {
  getCountryGroups,
  searchCities,
  type CityDataset,
} from './domain/cities'
import { DEFAULT_CALCULATION_SETTINGS } from './domain/prayerCalculation'
import { failure, success } from './domain/result'
import type { PrayerDay } from './domain/types'

const kazanToday: PrayerDay = {
  locationId: 'kazan',
  date: '2026-09-01',
  suhurEnd: '02:21',
  fajrJamaat: '03:17',
  sunrise: '04:48',
  zenith: '11:44',
  dhuhr: '12:00',
  asr: '16:24',
  maghrib: '18:39',
  isha: '20:33',
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
  const days = [kazanToday, kazanTomorrow, chelnyToday]

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

describe('Salah', () => {
  it('автоматически сохраняет параметры, повторяет неудачную запись и сохраняет старые поправки', async () => {
    const initial = manualCalculation({ profile: 'karachi', overrides: { fajrAngle: 19 } })
    const saveSettings = vi.fn().mockResolvedValueOnce(failure({ kind: 'storage', reason: 'unavailable' })).mockResolvedValue(success(undefined))
    const services = createServices({ initialize: vi.fn().mockResolvedValue(initialized({ preferences: initial })), saveSettings })
    render(<App services={services} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Настройки' }))
    await userEvent.click(screen.getByRole('button', { name: /Расписание/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Параметры' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Аср' }), 'standard')
    expect(await screen.findByText('Не удалось сохранить изменения')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    await waitFor(() => expect(screen.queryByText('Не удалось сохранить изменения')).not.toBeInTheDocument())
    expect(saveSettings).toHaveBeenLastCalledWith({ sourcePreferences: manualCalculation({ profile: 'karachi', overrides: { fajrAngle: 19, asrMethod: 'standard' } }) }, expect.any(Function))
    await userEvent.click(screen.getByRole('button', { name: 'Назад' }))
    await userEvent.click(screen.getByRole('button', { name: 'Параметры' }))
    expect(screen.getByRole('combobox', { name: 'Аср' })).toHaveValue('standard')
    expect(screen.getByText('Сохранены прежние поправки')).toBeVisible()
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

  it('выбор даты меняет расписание главной без перехода и сохраняет фокус календаря', async () => {
    render(<App services={createServices()} />)
    await screen.findByRole('timer')
    const dateInput = screen.getByLabelText('Выбрать дату')
    dateInput.focus()
    const pushState = vi.spyOn(window.history, 'pushState')
    fireEvent.change(dateInput, { target: { value: '2026-09-02' } })
    expect(await screen.findByRole('list', { name: 'Расписание дня' })).toHaveTextContent('16:21')
    expect(screen.getByRole('region', { name: 'Главная' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Назад' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Выбрать дату')).toBe(dateInput)
    expect(dateInput).toHaveFocus()
    expect(dateInput).toHaveValue('2026-09-02')
    expect(pushState).not.toHaveBeenCalled()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(screen.queryByText('сейчас')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Настройки' }))
    await userEvent.click(screen.getByRole('button', { name: 'Назад' }))
    expect(await screen.findByRole('list')).toHaveTextContent('16:21')
    expect(screen.getByLabelText('Выбрать дату')).toHaveValue('2026-09-02')
    await userEvent.click(screen.getByRole('button', { name: 'Сегодня' }))
    expect(await screen.findByRole('timer')).toHaveAccessibleName('До Асра, осталось 3 ч 24 мин')
    expect(screen.getByLabelText('Выбрать дату')).toHaveValue('2026-09-01')
    expect(screen.getByRole('list')).toHaveTextContent('16:24')
    pushState.mockRestore()
  })

  it.each(['manual', 'default'] as const)(
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

    expect(await screen.findByRole('button', { name: /Моё местоположение/ })).toBeVisible()
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
    expect(services.cities.findNearest).toHaveBeenCalled()
  })

  it('показывает весь день и выделяет текущее событие сразу на главной', async () => {
    render(<App services={createServices()} />)
    expect((await screen.findByText('Зухр', { exact: true })).closest('li')).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('timer')).toHaveAccessibleName('До Асра, осталось 3 ч 24 мин')
    expect(screen.queryByRole('button', { name: 'Расписание' })).not.toBeInTheDocument()
    await expectSchedule()
    const list = screen.getByRole('list', { name: 'Расписание дня' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(8)
    expect(within(list).getByText('Фаджр в мечети')).toBeVisible()
    expect(within(list).getByText('Зухр').closest('li')).toHaveAttribute('aria-current', 'true')
    expect(within(list).getByText('Аср').closest('li')).not.toHaveAttribute('aria-current')
  })

  it.each([
    ['2026-09-01T08:50:00Z', 'До Зухра, осталось 10 мин'],
    ['2026-09-01T00:00:00Z', 'До Фаджра в мечети, осталось 17 мин'],
  ])('сохраняет подписи намазов и джамаата в %s', async (time, label) => {
    render(<App services={createServices({ now: () => new Date(time) })} />)
    expect(await screen.findByRole('timer')).toHaveAccessibleName(label)
  })

  it('обновляет событие после возвращения из фона', async () => {
    let now = new Date('2026-09-01T13:23:59Z')
    render(<App services={createServices({ now: () => now })} />)
    expect(await screen.findByRole('timer')).toHaveAccessibleName('До Асра, осталось < 1 мин')
    act(() => { now = new Date('2026-09-01T13:24:00Z'); window.dispatchEvent(new Event('pageshow')) })
    expect((await screen.findByText('Аср', { exact: true })).closest('li')).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('timer')).toHaveAccessibleName('До Магриба, осталось 2 ч 15 мин')
  })

  it('показывает версию и лицензии в О приложении', async () => {
    render(<App services={createServices()} version="v26.4" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Настройки' }))
    await userEvent.click(screen.getByRole('button', { name: 'О приложении' }))
    expect(screen.getByText('v26.4')).toBeVisible()
    await userEvent.click(screen.getByText('Источники и лицензии'))
    expect(screen.getByRole('link', { name: 'SIL Open Font License 1.1' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'GeoNames' })).toBeVisible()
  })

  it('считает по часовому поясу города, а не устройства', async () => {
    render(<App services={createServices({ initialize: vi.fn().mockResolvedValue(initialized({ locationChoice: {
      mode: 'calculated', source: 'manual', coordinates: { latitude: 41.0138, longitude: 28.9497, timeZone: 'Europe/Istanbul', accuracy: null, timestamp: 1, name: 'Стамбул', cityId: 745044, source: 'preset' },
    } })), getDeviceTimeZone: () => 'America/Los_Angeles' })} />)
    await screen.findByRole('list', { name: 'Расписание дня' })
    await expectSchedule()
    expect(within(screen.getByRole('list')).getByText('04:53')).toBeVisible()
    expect(screen.getByText('1 сентября')).toBeVisible()
  })

  it('переключает сегодняшний день по московской полуночи, сохраняя выбранную чужую дату', async () => {
    let now = new Date('2026-08-31T20:59:59Z')
    const services = createServices({ now: () => now, getDeviceTimeZone: () => 'America/Los_Angeles' })
    render(<App services={services} />)
    await screen.findByRole('button', { name: 'Казань' })
    expect(screen.getByLabelText('Выбрать дату')).toHaveValue('2026-08-31')
    fireEvent.change(screen.getByLabelText('Выбрать дату'), { target: { value: '2026-09-02' } })
    await screen.findByRole('list')
    act(() => { now = new Date('2026-08-31T21:00:00Z'); window.dispatchEvent(new Event('pageshow')) })
    expect(screen.getByText('2 сентября')).toBeVisible()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Сегодня' }))
    expect(await screen.findByRole('timer')).toBeVisible()
    expect(screen.getByText('1 сентября')).toBeVisible()
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

  it('не загружает каталог до поиска и показывает ожидание', async () => {
    const loading = deferred<Awaited<ReturnType<AppServices['cities']['load']>>>()
    const services = createServices(); services.cities.load = vi.fn(() => loading.promise)
    render(<App services={services} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Казань' }))
    expect(services.cities.load).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Найти город' }))
    expect(screen.getByText('Загружаем города…')).toBeVisible()
    expect(screen.getByRole('searchbox')).toBeEnabled()
    await act(async () => { loading.resolve(success({ source: cityDataset.source, countryGroups: getCountryGroups(cityDataset) })); await loading.promise })
    expect(screen.queryByText('Загружаем города…')).not.toBeInTheDocument()
  })

  it.each([
    ['offline', 'Для поиска городов нужен интернет'],
    ['unavailable', 'Не удалось загрузить города'],
  ] as const)('показывает ошибку %s только после открытия поиска и позволяет повторить', async (reason, message) => {
    const services = createServices(); services.cities.load = vi.fn().mockResolvedValueOnce(failure({ kind: 'data', reason })).mockResolvedValue(success({ source: cityDataset.source, countryGroups: getCountryGroups(cityDataset) }))
    render(<App services={services} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Казань' }))
    expect(screen.queryByText(message)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Найти город' }))
    expect(await screen.findByText(message)).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    await waitFor(() => expect(screen.queryByText(message)).not.toBeInTheDocument())
    expect(services.cities.load).toHaveBeenCalledTimes(2)
  })

  it('повторно использует загруженный каталог и сохраняет регион города', async () => {
    const services = createServices()
    render(<App services={services} />)
    await screen.findByRole('button', { name: 'Казань' })
    await chooseCity('Стамбул', /Стамбул, Стамбул, Турция/)
    await expectSchedule()
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(7)
    await chooseCity('Казань', 'Казань, Татарстан, Россия', /Стамбул/)
    await expectSchedule()
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(8)
    expect(services.cities.load).toHaveBeenCalledTimes(1)
    expect(services.saveOfficialLocation).toHaveBeenLastCalledWith('kazan', 'manual', expect.objectContaining({ cityId: 551487, coverage: 'inside' }), expect.any(Function))
  })

  it('игнорирует позднее разрешение startup GPS после ручного выбора', async () => {
    const permission = deferred<GeolocationPermission>()
    const services = createServices({ initialize: vi.fn().mockResolvedValue(initialized({ locationChoice: { mode: 'official', locationId: 'kazan', source: 'automatic' } })), getPermission: vi.fn(() => permission.promise) })
    render(<App services={services} />)
    await screen.findByRole('button', { name: 'Казань' })
    await chooseCity('Челны', /Набережные Челны.*ДУМ РТ/)
    await act(async () => { permission.resolve('granted'); await permission.promise })
    expect(services.getPosition).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Набережные Челны' })).toBeVisible()
  })

  it('GPS внутри Татарстана использует ближайший опубликованный пункт', async () => {
    const services = createServices()
    render(<App services={services} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Казань' }))
    await userEvent.click(screen.getByRole('button', { name: 'По геопозиции' }))
    await screen.findByRole('button', { name: 'Моё местоположение' })
    await expectSchedule()
    expect(within(await screen.findByRole('list')).getByText('16:37')).toBeVisible()
    expect(services.getPosition).toHaveBeenCalledTimes(2)
    expect(services.saveOfficialLocation).toHaveBeenCalledWith('naberezhnye-chelny', 'automatic', expect.objectContaining({ selection: 'gps' }), expect.any(Function))
  })

  it('вне Татарстана сохраняет грубые GPS-координаты при отказе точного запроса и каталога', async () => {
    const position = { latitude: 41.01, longitude: 28.95, accuracy: 200, timestamp: 1_788_265_600_000 }
    const services = createServices({ getPosition: vi.fn().mockResolvedValueOnce(success(position)).mockResolvedValueOnce(failure({ kind: 'geolocation', reason: 'unavailable' })) })
    services.cities.findNearest = vi.fn().mockRejectedValue(new Error('offline'))
    render(<App services={services} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Казань' }))
    await userEvent.click(screen.getByRole('button', { name: 'По геопозиции' }))
    await screen.findByRole('button', { name: 'Моё местоположение' })
    await expectSchedule()
    expect(within(await screen.findByRole('list')).getAllByRole('listitem')).toHaveLength(7)
    expect(services.saveCalculatedLocation).toHaveBeenCalledWith(expect.objectContaining(position), 'automatic', expect.any(Function))
  })

  it.each(['rejection', 'result'] as const)('при ошибке записи %s не откатывает выбранный город', async kind => {
    const saveSettings = vi.fn<AppServices['saveSettings']>().mockImplementationOnce(() => kind === 'rejection' ? Promise.reject(new Error('quota')) : Promise.resolve(failure({ kind: 'storage', reason: 'unavailable' }))).mockResolvedValue(success(undefined))
    const services = createServices({ saveSettings })
    render(<App services={services} />)
    await screen.findByRole('button', { name: 'Казань' })
    await chooseCity('Челны', /Набережные Челны.*ДУМ РТ/)
    expect(await screen.findByText('Не удалось сохранить изменения')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Набережные Челны' })).toBeVisible()
    expect(screen.getAllByText('Не удалось сохранить изменения')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    await waitFor(() => expect(screen.queryByText('Не удалось сохранить изменения')).not.toBeInTheDocument())
    expect(saveSettings.mock.lastCall?.[0]).toMatchObject({ locationChoice: { locationId: 'naberezhnye-chelny' } })
  })

  it('восстанавливается после смены неподдерживаемого профиля', async () => {
    const services = createServices({ initialize: vi.fn().mockResolvedValue(initialized({ preferences: manualCalculation({ profile: 'ummAlQura', overrides: {} }) })), getCalculationProfileCapability: profile => profile === 'ummAlQura' ? { supported: false, reason: 'Календарь профиля недоступен' } : { supported: true } })
    render(<App services={services} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Календарь профиля недоступен')
    await openSource()
    await userEvent.click(screen.getByRole('button', { name: /Профиль/ }))
    expect(screen.getByRole('button', { name: /Умм аль-Кура/ })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Карачи' }))
    await backHomeFromSource()
    expect(await screen.findByRole('timer')).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('открывает сведения, подробности и методику отдельными экранами', async () => {
    render(<App services={createServices({ initialize: vi.fn().mockResolvedValue(initialized({ preferences: manualCalculation({ profile: 'karachi', overrides: {} }) })) })} />)
    await openSource()
    await userEvent.click(screen.getByRole('button', { name: 'О расписании' }))
    expect(screen.getByRole('region', { name: 'Сведения об источнике' })).toBeVisible()
    await userEvent.click(screen.getByText('Подробности'))
    expect(screen.getByText('Europe/Moscow')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Как считается время' }))
    expect(screen.getByRole('heading', { name: 'Расчёт на устройстве' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Назад' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Как считается время' })).toHaveFocus())
  })

  it('открывает Поделиться и возвращает фокус в настройки', async () => {
    render(<App services={createServices()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Настройки' }))
    await userEvent.click(screen.getByRole('button', { name: 'Поделиться' }))
    expect(screen.getByRole('img', { name: 'QR-код ссылки на приложение' })).toBeVisible()
    expect(screen.queryByRole('region', { name: 'Настройки' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Назад' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Поделиться' })).toHaveFocus())
  })

  it('повторяет загрузку после ошибки открытия хранилища и ошибки дня', async () => {
    const base = createServices()
    const services = createServices({ initialize: vi.fn().mockResolvedValueOnce(failure({ kind: 'storage', reason: 'unavailable' })).mockResolvedValue(initialized()), getDays: vi.fn().mockResolvedValueOnce(failure({ kind: 'storage', reason: 'unavailable' })).mockImplementation(base.getDays) })
    render(<App services={services} />)
    expect(await screen.findByRole('alert')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Попробовать снова' }))
    expect(await screen.findByRole('button', { name: 'Повторить' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByRole('timer')).toBeVisible()
  })

  it('при быстрых сменах города скрывает старую таблицу и игнорирует запоздалый ответ', async () => {
    const base = createServices()
    const chelny = deferred<Awaited<ReturnType<AppServices['getDays']>>>()
    const apastovo = deferred<Awaited<ReturnType<AppServices['getDays']>>>()
    const services = createServices({ initialize: vi.fn().mockResolvedValue(initialized({ meta: { ...initializedState.meta, locations: [...initializedState.meta.locations, { id: 'apastovo', name: 'Апастово', latitude: 55.2, longitude: 48.5 }] } })), getDays: vi.fn<AppServices['getDays']>((id, dates, revision) => id === 'naberezhnye-chelny' ? chelny.promise : id === 'apastovo' ? apastovo.promise : base.getDays(id, dates, revision)) })
    render(<App services={services} />)
    await screen.findByRole('timer')
    await chooseCity('Челны', /Набережные Челны.*ДУМ РТ/)
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    await chooseCity('Апастово', /Апастово.*ДУМ РТ/, /Набережные Челны/)
    await act(async () => { chelny.resolve(success([undefined, chelnyToday, undefined])); await chelny.promise })
    expect(screen.getByText('Загружаем расписание…')).toBeVisible()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    await act(async () => { apastovo.resolve(success([undefined, { ...kazanToday, locationId: 'apastovo', asr: '16:45' }, undefined])); await apastovo.promise })
    expect(await screen.findByText('16:45')).toBeVisible()
    await expectSchedule()
    expect(within(screen.getByRole('list')).getByText('16:45')).toBeVisible()
    expect(screen.queryByText('16:37')).not.toBeInTheDocument()
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
  })

  it.each([automaticPreferences(), { mode: 'manual', source: { kind: 'official', provider: 'dumRt' } } as const])('различает отсутствие таблицы в автоматическом и ручном режиме', async preferences => {
    render(<App services={createServices({ initialize: vi.fn().mockResolvedValue(initialized({ preferences })) })} />)
    await screen.findByRole('button', { name: 'Казань' })
    fireEvent.change(screen.getByLabelText('Выбрать дату'), { target: { value: '2027-01-01' } })
    if (preferences.mode === 'automatic') expect(within(await screen.findByRole('list')).getByText('Фаджр')).toBeVisible()
    else {
      expect(await screen.findByRole('alert')).toHaveTextContent('не покрывает это место или дату')
      expect(screen.queryByRole('list')).not.toBeInTheDocument()
    }
  })

  it('сохранённая светлая тема не включает старый интерфейс и не добавляет прежние разделы', async () => {
    render(<App services={createServices({ initialize: vi.fn().mockResolvedValue(initialized({ appearance: 'light' })) })} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Настройки' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(screen.queryByRole('combobox', { name: 'Оформление' })).not.toBeInTheDocument()
    expect(screen.queryByText('Часовой пояс')).not.toBeInTheDocument()
  })
})

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
