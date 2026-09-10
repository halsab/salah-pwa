import { settingsServices, type TestSettingsServices } from './test/settingsServices'
import { automaticPreferences, manualCalculation } from './domain/sourcePreferences'
import { selectionFromSettings } from './domain/calculationSettings'
import geometry from '../public/data/tatarstan-boundary.json'
import { parseCoverageGeometry } from './domain/localGeography'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { App, type AppServices } from './App'
import type { CityCatalog } from './data/cityCatalog'
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
  it('выбор даты открывает список этого дня, а возврат показывает сводку сегодня', async () => {
    render(<App services={createServices()} />)
    await screen.findByRole('region', { name: 'Текущее событие' })
    fireEvent.change(screen.getByLabelText('Выбрать дату'), { target: { value: '2026-09-02' } })
    expect(await screen.findByRole('list', { name: 'Расписание дня' })).toHaveTextContent('16:21')
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Назад' }))
    expect(await screen.findByRole('region', { name: 'Текущее событие' })).toHaveTextContent('Зухрс 12:00')
    expect(screen.getByLabelText('Выбрать дату')).toHaveValue('2026-09-01')
    expect(screen.queryByRole('list', { name: 'Расписание дня' })).not.toBeInTheDocument()
  })

  it('показывает номер релизной сборки в настройках', async () => {
    render(<App services={createServices()} version="v26.4" />)

    await screen.findByRole('button', { name: /Казань/ })

    await userEvent.click(screen.getByRole('button', { name: 'Настройки' }))
    const version = screen.getByText('v26.4')
    expect(version).toBeVisible()
    expect(version).toHaveClass('app-version')
  })

  it('показывает только текущий UTC-сдвиг для города в другом часовом поясе', async () => {
    const services = createServices({
      initialize: vi.fn().mockResolvedValue(initialized({
        locationChoice: {
          mode: 'calculated',
          source: 'manual',
          coordinates: {
          latitude: 41.0138,
          longitude: 28.9497,
          timeZone: 'Europe/Istanbul',
          accuracy: null,
          timestamp: 1_788_256_800_000,
          name: 'Istanbul, Турция',
          cityId: 745044,
              source: 'preset',
          },
        },
      })),
      getDeviceTimeZone: () => 'America/Los_Angeles',
    })

    render(<App services={services} />)

    expect(await screen.findByRole('button', {
      name: 'Местоположение: Istanbul, Турция · UTC+3',
    })).toBeVisible()
    const schedule = await screen.findByRole('list', { name: 'Расписание дня' })
    expect(within(schedule).getByText('04:53')).toBeVisible()
    expect(document.body).not.toHaveTextContent('Europe/Istanbul')
    expect(document.querySelector('[aria-label*="Europe/Istanbul"]')).toBeNull()
  })

  it('скрывает UTC-сдвиг для канонически одинаковых часовых поясов', async () => {
    const services = createServices({
      initialize: vi.fn().mockResolvedValue(initialized({
        locationChoice: {
          mode: 'calculated',
          source: 'manual',
          coordinates: {
          latitude: 34.0522,
          longitude: -118.2437,
          timeZone: 'America/Los_Angeles',
          accuracy: null,
          timestamp: 1_788_256_800_000,
          name: 'Los Angeles, США',
          source: 'preset',
          },
        },
      })),
      getDeviceTimeZone: () => 'US/Pacific',
    })

    render(<App services={services} />)

    expect(await screen.findByRole('button', {
      name: 'Местоположение: Los Angeles, США',
    })).toBeVisible()
    expect(screen.queryByRole('button', { name: /Los Angeles.+UTC/ })).not.toBeInTheDocument()
  })

  it('выделяет следующий намаз и считает время до него', async () => {
    render(<App services={createServices()} />)

    expect(await screen.findByRole('button', { name: /Казань/ })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Salah' })).toBeVisible()
    expect(await screen.findByText('До асра')).toBeVisible()
    expect(screen.getByText('Следующий намаз')).toBeVisible()
    expect(screen.queryByText('Сейчас')).not.toBeInTheDocument()
    expect(document.querySelector('.next-name')).toHaveTextContent('Аср')
    expect(screen.getByText('03:24:00')).toBeVisible()

    const schedule = screen.getByRole('list', { name: 'Расписание дня' })
    expect(within(schedule).getAllByRole('listitem')).toHaveLength(8)
    expect(within(schedule).getByText('Завершение сухура')).toBeVisible()
    expect(within(schedule).getByText(/в мечетях/i)).toBeVisible()
    expect(within(schedule).getByText('20:33')).toBeVisible()
    expect(within(schedule).getByText('Аср').closest('li')).toHaveAttribute('data-active', 'true')
    expect(within(schedule).getByText('Зухр').closest('li')).not.toHaveAttribute('data-active')
    expect(within(schedule).queryByLabelText('Текущий намаз')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Официальное расписание · ДУМ РТ/ })).toBeVisible()
    expect(screen.queryByText(/Координаты и выбранный город/i)).not.toBeInTheDocument()
  })

  it('после зенита выделяет Зухр и считает до него', async () => {
    render(<App services={createServices({
      now: () => new Date('2026-09-01T08:50:00.000Z'),
    })} />)

    expect(await screen.findByText('До зухра')).toBeVisible()
    expect(screen.getByText('До зухра')).toBeVisible()
    expect(screen.getByText('00:10:00')).toBeVisible()

    const schedule = screen.getByRole('list', { name: 'Расписание дня' })
    expect(within(schedule).getByText('Зухр').closest('li')).toHaveAttribute('data-active', 'true')
    expect(within(schedule).getByText('Зенит').closest('li')).not.toHaveAttribute('data-active')
  })

  it('точно переключает следующий намаз на его границе', async () => {
    let now = new Date('2026-09-01T13:23:59.000Z')
    const services = createServices({ now: () => new Date(now) })
    render(<App services={services} />)

    expect(await screen.findByText('До асра')).toBeVisible()
    expect(screen.getByText('До асра')).toBeVisible()
    expect(screen.getByText('00:00:01')).toBeVisible()

    now = new Date(now.getTime() + 1_000)
    await new Promise((resolve) => setTimeout(resolve, 1_100))

    expect(document.querySelector('.next-name')).toHaveTextContent('Магриб')
    expect(screen.getByText('До магриба')).toBeVisible()
    expect(screen.getByText('02:15:00')).toBeVisible()
    expect(
      screen.getByRole('list', { name: 'Расписание дня' })
        .querySelector('[data-active="true"] .prayer-name'),
    ).toHaveTextContent('Магриб')
  })

  it('для утреннего намаза использует уточнённую подпись таймера', async () => {
    render(<App services={createServices({
      now: () => new Date('2026-09-01T00:00:00.000Z'),
    })} />)

    expect(await screen.findByText('Ближайший джамаат')).toBeVisible()
    expect(screen.getByText('До утреннего в мечети')).toBeVisible()
  })

  it('при просмотре другой даты скрывает таймер и показывает кнопку Сегодня', async () => {
    const user = userEvent.setup()
    render(<App services={createServices()} />)

    await screen.findByText('До асра')
    await user.click(screen.getByRole('button', { name: 'Следующий день' }))

    expect((await screen.findAllByText('среда, 2 сентября'))[0]).toBeVisible()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Сегодня' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Сегодня' }))
    expect(await screen.findByText('вторник, 1 сентября')).toBeVisible()
  })

  it('после возврата в приложение переключает сегодняшний день и расписание', async () => {
    let now = new Date('2026-08-31T20:59:59.000Z')
    const services = createServices({
      getDeviceTimeZone: () => 'America/Los_Angeles',
      now: () => new Date(now),
    })
    render(<App services={services} />)

    expect((await screen.findAllByText('понедельник, 31 августа'))[0]).toBeVisible()
    await waitFor(() => expect(services.getDays).toHaveBeenCalledTimes(1))
    vi.mocked(services.getDays).mockClear()

    act(() => {
      now = new Date('2026-08-31T21:00:00.000Z')
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(await screen.findByText('вторник, 1 сентября')).toBeVisible()
    await waitFor(() => {
      expect(services.getDays).toHaveBeenCalledWith('kazan', ['2026-08-31', '2026-09-01', '2026-09-02'], expect.any(String))
    })
  })

  it('при полуночи выбранного места сохраняет вручную выбранную дату', async () => {
    let now = new Date('2026-08-31T20:59:59.000Z')
    const services = createServices({
      getDeviceTimeZone: () => 'America/Los_Angeles',
      now: () => new Date(now),
    })
    const user = userEvent.setup()
    render(<App services={services} />)

    await screen.findByText('понедельник, 31 августа')
    await user.click(screen.getByRole('button', { name: 'Предыдущий день' }))
    expect((await screen.findAllByText('воскресенье, 30 августа'))[0]).toBeVisible()

    act(() => {
      now = new Date('2026-08-31T21:00:00.000Z')
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect((await screen.findAllByText('воскресенье, 30 августа'))[0]).toBeVisible()
    expect(screen.getAllByRole('button', { name: 'Сегодня' })[0]).toBeVisible()
  })

  it('использует московскую гражданскую дату для официальной Казани', async () => {
    const services = createServices({
      getDeviceTimeZone: () => 'America/Los_Angeles',
      now: () => new Date('2026-08-31T21:30:00.000Z'),
    })

    render(<App services={services} />)

    expect(await screen.findByText('вторник, 1 сентября')).toBeVisible()
    expect(services.getDays).toHaveBeenCalledWith('kazan', ['2026-08-31', '2026-09-01', '2026-09-02'], expect.any(String))
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

  it('игнорирует позднее разрешение startup permission после ручного выбора', async () => {
    const permission = deferred<PermissionState>()
    const services = createServices({
      initialize: vi.fn().mockResolvedValue(initialized({
        locationChoice: {
          mode: 'official',
          locationId: 'kazan',
          source: 'automatic',
        },
      })),
      getPermission: vi.fn().mockReturnValue(permission.promise),
    })
    const user = userEvent.setup()
    render(<App services={services} />)

    await waitFor(() => expect(services.getPermission).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole('button', { name: /Казань/ }))
    await user.click(screen.getByRole('button', { name: 'Набережные Челны' }))
    await act(async () => {
      permission.resolve('granted')
      await permission.promise
    })

    expect(await screen.findByRole('button', { name: /Набережные Челны/ })).toBeVisible()
    expect(services.getPosition).not.toHaveBeenCalled()
    expect(services.saveOfficialLocation).toHaveBeenCalledTimes(1)
    expect(services.saveOfficialLocation).toHaveBeenCalledWith('naberezhnye-chelny', 'manual', expect.objectContaining({ selection: 'official' }), expect.any(Function))
  })



  it('меняет населённый пункт через доступный диалог', async () => {
    const user = userEvent.setup()
    const services = createServices()
    render(<App services={services} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    const dialog = screen.getByRole('dialog', { name: 'Выбор местоположения' })
    await user.click(within(dialog).getByRole('button', { name: 'Найти город или район' }))
    const searchDialog = screen.getByRole('dialog', { name: 'Поиск населённого пункта' })
    await user.type(within(searchDialog).getByRole('searchbox'), 'челны')
    await user.click(within(searchDialog).getByRole('button', { name: 'Набережные Челны' }))

    expect(await screen.findByRole('button', { name: /Набережные Челны/ })).toBeVisible()
    expect(within(screen.getByRole('list')).getByText('16:37')).toBeVisible()
    expect(services.saveOfficialLocation).toHaveBeenCalledWith('naberezhnye-chelny', 'manual', expect.objectContaining({ selection: 'official' }), expect.any(Function))
  })

  it('переключает шит в сфокусированный режим поиска', async () => {
    const user = userEvent.setup()
    render(<App services={createServices()} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    const dialog = screen.getByRole('dialog', { name: 'Выбор местоположения' })
    expect(within(dialog).queryByRole('searchbox')).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Найти город или район' }))

    const searchDialog = screen.getByRole('dialog', { name: 'Поиск населённого пункта' })
    expect(within(searchDialog).getByRole('searchbox')).toHaveFocus()
    expect(within(searchDialog).queryByText('Выбор местоположения')).not.toBeInTheDocument()
    expect(within(searchDialog).queryByRole('button', { name: 'Определить автоматически' })).not.toBeInTheDocument()
    expect(within(searchDialog).queryByText(/GeoNames/)).not.toBeInTheDocument()
    expect(within(searchDialog).getByRole('button', { name: 'Закрыть' })).toBeVisible()
  })

  it('закрывает весь шит крестиком в режиме поиска', async () => {
    const user = userEvent.setup()
    render(<App services={createServices()} />)

    const locationButton = await screen.findByRole('button', { name: /Казань/ })
    await user.click(locationButton)
    await user.click(screen.getByRole('button', { name: 'Найти город или район' }))
    const searchDialog = screen.getByRole('dialog', { name: 'Поиск населённого пункта' })
    await user.click(within(searchDialog).getByRole('button', { name: 'Закрыть' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(locationButton).toHaveFocus())
  })

  it('не загружает города до фактического открытия поиска', async () => {
    const user = userEvent.setup()
    const services = createServices()
    render(<App services={services} />)

    const locationButton = await screen.findByRole('button', { name: /Казань/ })
    expect(services.cities.load).not.toHaveBeenCalled()

    await user.click(locationButton)
    expect(services.cities.load).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Найти город или район' }))

    expect(services.cities.load).toHaveBeenCalledTimes(1)
  })

  it('показывает короткий статус во время загрузки городов', async () => {
    const user = userEvent.setup()
    let resolveCities: ((value: ReturnType<typeof success<CityCatalog>>) => void) | undefined
    const load = vi.fn().mockImplementation(() => new Promise((resolve) => {
      resolveCities = resolve
    }))
    const services = createServices({
      cities: {
        ...createServices().cities,
        load,
      },
    })
    render(<App services={services} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    await user.click(screen.getByRole('button', { name: 'Найти город или район' }))

    expect(screen.getByText('Загружаем города')).toBeVisible()

    if (!resolveCities) throw new Error('Не создан resolver каталога')
    resolveCities(success({
      source: cityDataset.source,
      countryGroups: getCountryGroups(cityDataset),
    }))
    expect(await screen.findByText('Турция', { exact: true })).toBeVisible()
  })

  it('показывает специальную офлайн-ошибку только после попытки открыть поиск', async () => {
    const user = userEvent.setup()
    const services = createServices({
      cities: {
        ...createServices().cities,
        load: vi.fn().mockResolvedValue(failure({ kind: 'data', reason: 'offline' })),
      },
    })

    render(<App services={services} />)
    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    expect(screen.queryByText('Нет сети, а каталог городов ещё не сохранён')).not.toBeInTheDocument()
    expect(services.cities.load).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Найти город или район' }))
    expect(await screen.findByText('Нет сети, а каталог городов ещё не сохранён')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(services.cities.load).toHaveBeenCalledTimes(2)
  })

  it('показывает общую ошибку загрузки каталога при доступной сети', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    const user = userEvent.setup()
    const services = createServices({
      cities: {
        ...createServices().cities,
        load: vi.fn().mockResolvedValue(failure({ kind: 'data', reason: 'invalid' })),
      },
    })

    try {
      render(<App services={services} />)
      await user.click(await screen.findByRole('button', { name: /Казань/ }))
      await user.click(screen.getByRole('button', { name: 'Найти город или район' }))

      expect(await screen.findByText('Города сейчас недоступны')).toBeVisible()
      expect(screen.queryByText('Нет сети, а каталог городов ещё не сохранён')).not.toBeInTheDocument()
    } finally {
      online.mockRestore()
    }
  })

  it('использует уже загруженный каталог после перехода офлайн', async () => {
    const user = userEvent.setup()
    const services = createServices()
    render(<App services={services} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    await user.click(screen.getByRole('button', { name: 'Найти город или район' }))
    await screen.findByText('Турция', { exact: true })
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

    try {
      await user.type(screen.getByRole('searchbox'), 'Стамбул')
      expect(await screen.findByRole('button', { name: 'Стамбул, Стамбул, Турция' })).toBeVisible()
      expect(screen.queryByText('Нет сети, а каталог городов ещё не сохранён')).not.toBeInTheDocument()
      expect(services.cities.load).toHaveBeenCalledTimes(1)
    } finally {
      online.mockRestore()
    }
  })

  it('обновляет секунды без корневого ререндера и не сбрасывает поиск', async () => {
    const user = userEvent.setup()
    let now = new Date('2026-09-01T10:00:00.000Z')
    const getDeviceTimeZone = vi.fn(() => 'Europe/Moscow')
    const services = createServices({
      getDeviceTimeZone,
      now: () => new Date(now),
    })
    render(<App services={services} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    await user.click(screen.getByRole('button', { name: 'Найти город или район' }))
    await user.type(screen.getByRole('searchbox'), 'челны')
    expect(screen.getByRole('button', { name: 'Набережные Челны' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Казань' })).not.toBeInTheDocument()
    expect(screen.getByText('03:24:00')).toBeVisible()
    getDeviceTimeZone.mockClear()

    now = new Date(now.getTime() + 1_000)
    await new Promise((resolve) => setTimeout(resolve, 1_100))

    expect(screen.getByText('03:23:59')).toBeVisible()
    expect(getDeviceTimeZone).not.toHaveBeenCalled()
    expect(screen.getByRole('searchbox')).toHaveValue('челны')
    expect(screen.getByRole('button', { name: 'Набережные Челны' })).toBeVisible()
  })

  it('закрывает выбор населённого пункта с клавиатуры и возвращает фокус', async () => {
    const user = userEvent.setup()
    render(<App services={createServices()} />)

    const locationButton = await screen.findByRole('button', { name: /Казань/ })
    await user.click(locationButton)
    await user.click(screen.getByRole('button', { name: 'Найти город или район' }))
    await waitFor(() => expect(screen.getByRole('searchbox')).toHaveFocus())

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(locationButton).toHaveFocus())
  })

  it('объявляет выбранный населённый пункт в диалоге', async () => {
    const user = userEvent.setup()
    render(<App services={createServices()} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    const dialog = screen.getByRole('dialog', { name: 'Выбор местоположения' })
    const selectedLocation = within(dialog).getByRole('button', { name: 'Казань' })
    const lastLocation = within(dialog).getByRole('button', { name: 'Набережные Челны' })

    expect(selectedLocation).toHaveAttribute('aria-current', 'location')
    expect(lastLocation).not.toHaveAttribute('aria-current')
  })

  it('локально выбирает ближайший пункт по геолокации', async () => {
    const user = userEvent.setup()
    const services = createServices()
    render(<App services={services} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    await user.click(screen.getByRole('button', { name: 'Определить автоматически' }))

    expect(await screen.findByRole('button', { name: /Моё местоположение/ })).toBeVisible()
    expect(services.getPosition).toHaveBeenNthCalledWith(1, 'coarse')
    expect(services.getPosition).toHaveBeenNthCalledWith(2, 'precise')
    expect(services.getPosition).toHaveBeenCalledTimes(2)
    expect(services.getPermission).not.toHaveBeenCalled()
    expect(services.cities.load).not.toHaveBeenCalled()
    expect(services.cities.search).not.toHaveBeenCalled()
    expect(services.cities.findNearest).toHaveBeenCalled()
    expect(services.saveOfficialLocation).toHaveBeenCalledWith(
      'naberezhnye-chelny',
      'automatic',
      expect.objectContaining({ selection: 'gps' }),
      expect.any(Function),
    )
  })

  it('вне Татарстана уточняет координаты и показывает семь рассчитанных времён', async () => {
    const user = userEvent.setup()
    const coarse = {
      latitude: 55.75,
      longitude: 37.62,
      accuracy: 900,
      timestamp: 100,
    }
    const precise = { ...coarse, latitude: 55.7558, longitude: 37.6173, accuracy: 12, timestamp: 200 }
    const services = createServices({
      getPosition: vi.fn()
        .mockResolvedValueOnce(success(coarse))
        .mockResolvedValueOnce(success(precise)),
    })
    render(<App services={services} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    await user.click(screen.getByRole('button', { name: 'Определить автоматически' }))

    expect(await screen.findByRole('button', { name: /Моё местоположение/i })).toBeVisible()
    const schedule = screen.getByRole('list', { name: 'Расписание дня' })
    expect(within(schedule).getAllByRole('listitem')).toHaveLength(7)
    expect(within(schedule).getByText('Фаджр')).toBeVisible()
    expect(within(schedule).queryByText(/сухура/i)).not.toBeInTheDocument()
    expect(within(schedule).queryByText(/в мечетях/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Расчётное время/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /Расчётное время/ })).toBeVisible()
    expect(services.getPosition).toHaveBeenNthCalledWith(1, 'coarse')
    expect(services.getPosition).toHaveBeenNthCalledWith(2, 'precise')
    expect(services.saveCalculatedLocation).toHaveBeenCalledWith(expect.objectContaining({
      ...precise,
      timeZone: 'Europe/Moscow',
      name: 'Моё местоположение',
      selection: 'gps',
    }), 'automatic', expect.any(Function))
    expect(services.cities.load).not.toHaveBeenCalled()
    expect(services.cities.search).not.toHaveBeenCalled()
    expect(services.cities.findNearest).toHaveBeenCalled()
  })

  it('считает по грубым координатам, если точное определение не удалось', async () => {
    const user = userEvent.setup()
    const coarse = {
      latitude: 55.75,
      longitude: 37.62,
      accuracy: 1_200,
      timestamp: 100,
    }
    const services = createServices({
      getPosition: vi.fn()
        .mockResolvedValueOnce(success(coarse))
        .mockResolvedValueOnce(failure({ kind: 'geolocation', reason: 'timeout' })),
    })
    render(<App services={services} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    await user.click(screen.getByRole('button', { name: 'Определить автоматически' }))

    expect(await screen.findByText('Фаджр')).toBeVisible()
    expect(services.saveCalculatedLocation).toHaveBeenCalledWith(expect.objectContaining({
      ...coarse,
      timeZone: 'Europe/Moscow',
      selection: 'gps',
    }), 'automatic', expect.any(Function))
  })

  it('рассчитывает по GPS без названия города, когда справочник недоступен', async () => {
    const user = userEvent.setup()
    const coarse = {
      latitude: 55.75,
      longitude: 37.62,
      accuracy: 900,
      timestamp: 100,
    }
    const precise = { ...coarse, latitude: 55.7558, longitude: 37.6173, accuracy: 12, timestamp: 200 }
    const services = createServices({
      getPosition: vi.fn()
        .mockResolvedValueOnce(success(coarse))
        .mockResolvedValueOnce(success(precise)),
      getDeviceTimeZone: () => 'America/Los_Angeles',
    })
    render(<App services={services} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    expect(services.cities.load).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Определить автоматически' }))

    expect(await screen.findByRole('button', { name: /Моё местоположение/ })).toBeVisible()
    expect(screen.getByRole('list', { name: 'Расписание дня' }).children).toHaveLength(7)
    expect(services.saveCalculatedLocation).toHaveBeenCalledWith(expect.objectContaining({
      ...precise,
      timeZone: 'America/Los_Angeles',
      selection: 'gps',
    }), 'automatic', expect.any(Function))
    expect(services.cities.load).not.toHaveBeenCalled()
    expect(services.cities.search).not.toHaveBeenCalled()
    expect(services.cities.findNearest).toHaveBeenCalled()
  })

  it('ищет и выбирает город из офлайн-справочника', async () => {
    const user = userEvent.setup()
    const services = createServices()
    render(<App services={services} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    await user.click(screen.getByRole('button', { name: 'Найти город или район' }))
    await user.type(screen.getByRole('searchbox'), 'Стамбул')
    expect(await screen.findByText('Стамбул, Турция', { exact: true })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Стамбул, Стамбул, Турция' }))

    expect(await screen.findByRole('button', { name: /Стамбул, Стамбул, Турция/ })).toBeVisible()
    expect(services.saveCalculatedLocation).toHaveBeenCalledWith(expect.objectContaining({
      latitude: 41.0138,
      longitude: 28.9497,
      timeZone: 'Europe/Istanbul',
      accuracy: null,
      timestamp: 1_788_256_800_000,
      name: 'Стамбул, Стамбул, Турция',
      cityId: 745044,
      selection: 'city',
    }), 'manual', expect.any(Function))
  })

  it('назначает официальное расписание только городу GeoNames из RU.73', async () => {
    const user = userEvent.setup()
    const services = createServices()
    render(<App services={services} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    await user.click(screen.getByRole('button', { name: 'Найти город или район' }))
    await user.type(screen.getByRole('searchbox'), 'Казань')
    await user.click(await screen.findByRole('button', { name: 'Казань, Татарстан, Россия' }))

    expect(services.saveOfficialLocation).toHaveBeenCalledWith('kazan', 'manual', expect.objectContaining({ selection: 'city' }), expect.any(Function))
    expect(services.saveCalculatedLocation).not.toHaveBeenCalled()
  })

  it('не откатывает ручной выбор при отклонённом фоновом сохранении', async () => {
    const user = userEvent.setup()
    const services = createServices({
      saveOfficialLocation: vi.fn().mockRejectedValue(new Error('idb unavailable')),
    })
    render(<App services={services} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    await user.click(screen.getByRole('button', { name: 'Найти город или район' }))
    await user.type(screen.getByRole('searchbox'), 'челны')
    await user.click(screen.getByRole('button', { name: 'Набережные Челны' }))

    expect(await screen.findByRole('button', { name: /Набережные Челны/ })).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('не откатывает ручной выбор при typed-ошибке фонового сохранения', async () => {
    const user = userEvent.setup()
    const services = createServices({
      saveOfficialLocation: vi.fn().mockResolvedValue(failure({
        kind: 'storage',
        reason: 'unavailable',
      })),
    })
    render(<App services={services} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    await user.click(screen.getByRole('button', { name: 'Набережные Челны' }))

    expect(await screen.findByRole('button', { name: /Набережные Челны/ })).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('показывает статус поиска и страну результата', async () => {
    const user = userEvent.setup()
    let resolveSearch: ((cities: ReturnType<typeof success<import('./data/cityCatalog').CitySearchResult>>) => void) | undefined
    const search = vi.fn().mockImplementation(() => new Promise((resolve) => {
      resolveSearch = resolve
    }))
    const services = createServices({
      cities: {
        ...createServices().cities,
        search,
      },
    })
    render(<App services={services} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    await user.click(screen.getByRole('button', { name: 'Найти город или район' }))
    await user.type(screen.getByRole('searchbox'), 'Москва')

    expect(await screen.findByText('Ищем города…', { selector: '.city-search-state p' })).toBeVisible()
    await waitFor(() => expect(search).toHaveBeenCalledWith('Москва'))
    if (!resolveSearch) throw new Error('Не создан resolver поиска')
    resolveSearch(success({cities:searchCities(cityDataset, 'Москва'),status:'complete',missingPackages:[]}))

    expect(await screen.findByText('Москва, Россия', { exact: true })).toBeVisible()
    expect(screen.getByText('Найдено вариантов: 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Москва, Москва, Россия' })).toBeVisible()
  })

  it('показывает крупнейшие города подпунктами страны', async () => {
    const user = userEvent.setup()
    render(<App services={createServices()} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    const dialog = screen.getByRole('dialog', { name: 'Выбор местоположения' })
    await user.click(within(dialog).getByRole('button', { name: 'Найти город или район' }))
    const searchDialog = screen.getByRole('dialog', { name: 'Поиск населённого пункта' })
    await user.click(await within(searchDialog).findByText('Турция', { exact: true }))

    expect(within(searchDialog).getByText('Крупные города · 1 из 1')).toBeVisible()
    expect(within(searchDialog).getByRole('button', { name: 'Стамбул, Стамбул, Турция' })).toBeVisible()
  })



  it('сохраняет Аср, профиль и северное правило независимо', async () => {
    const user = userEvent.setup()
    const services = createServices()
    render(<App services={services} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    await user.click(screen.getByRole('button', { name: 'Найти город или район' }))
    await user.type(screen.getByRole('searchbox'), 'Стамбул')
    await user.click(await screen.findByRole('button', { name: 'Стамбул, Стамбул, Турция' }))
    expect(await screen.findByRole('button', { name: /Стамбул, Стамбул, Турция/ })).toBeVisible()

    await user.click(await screen.findByRole('button', { name: 'Настройки' }))
    await user.click(screen.getByRole('button', { name: 'Время намаза' }))
    await user.click(screen.getByRole('button', { name: 'Расширенные настройки' }))
    const dialog = screen.getByRole('dialog', { name: 'Расширенные настройки' })
    expect(within(dialog).getByText(/Автоматический выбор источника будет отключён/)).toBeVisible()
    const asrSelect = within(dialog).getByRole('combobox', { name: 'Аср' })
    expect(asrSelect).toBeEnabled()
    expect(within(asrSelect).getByRole('option', { name: 'Ханафитский' })).toBeVisible()
    expect(within(asrSelect).getByRole('option', {
      name: 'Шафиитский, маликитский и ханбалитский',
    })).toBeVisible()
    expect(within(asrSelect).queryByRole('option', { name: 'Стандартный' })).not.toBeInTheDocument()
    await user.selectOptions(asrSelect, 'standard')
    await user.selectOptions(within(dialog).getByLabelText('Профиль'), 'dumRf')
    await user.selectOptions(within(dialog).getByLabelText('Северные правила'), 'seventhOfNight')
    await user.click(screen.getByRole('button', { name: 'Применить ручной расчёт' }))

    expect(services.saveCalculationSettings).toHaveBeenLastCalledWith({
      asrMethod: 'standard',
      profile: 'dumRf',
      highLatitudeRule: 'seventhOfNight',
    })
  })

  it('отключает профиль Умм аль-Кура и объясняет отсутствие поддержки календаря', async () => {
    const user = userEvent.setup()
    const services = createServices({
      getCalculationProfileCapability: (profile) => profile === 'ummAlQura'
        ? {
            supported: false,
            reason: 'Профиль «Умм аль-Кура» недоступен: календарь не поддерживается этим браузером.',
          }
        : { supported: true },
    })
    render(<App services={services} />)

    await user.click(await screen.findByRole('button', { name: 'Настройки' }))
    await user.click(screen.getByRole('button', { name: 'Время намаза' }))
    await user.click(screen.getByRole('button', { name: 'Расширенные настройки' }))
    const dialog = screen.getByRole('dialog', { name: 'Расширенные настройки' })

    expect(within(dialog).getByRole('option', { name: 'Умм аль-Кура' })).toBeDisabled()
    expect(within(dialog).getByText(
      'Профиль «Умм аль-Кура» недоступен: календарь не поддерживается этим браузером.',
    )).toBeVisible()
  })

  it('сохраняет причину ошибки для выбранного Умм аль-Кура и восстанавливается после смены профиля', async () => {
    const reason =
      'Профиль «Умм аль-Кура» недоступен: календарь islamic-umalqura не поддерживается этим браузером.'
    const resolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(
      function (this: Intl.DateTimeFormat) {
        return { ...resolvedOptions.call(this), calendar: 'gregory' }
      },
    )
    const services = createServices({
      initialize: vi.fn().mockResolvedValue(initialized({
        locationChoice: {
          mode: 'calculated',
          source: 'manual',
          coordinates: {
          latitude: 21.4225,
          longitude: 39.8262,
          timeZone: 'Asia/Riyadh',
          accuracy: null,
          timestamp: 1_788_256_800_000,
          name: 'Мекка, Саудовская Аравия',
          source: 'preset',
          },
        },
        calculationSettings: {
          ...DEFAULT_CALCULATION_SETTINGS,
          profile: 'ummAlQura',
        },
      })),
      getCalculationProfileCapability: (profile) => profile === 'ummAlQura'
        ? { supported: false, reason }
        : { supported: true },
    })
    const user = userEvent.setup()

    render(<App services={services} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(reason)
    expect(services.saveCalculationSettings).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Настройки' }))
    await user.click(screen.getByRole('button', { name: 'Время намаза' }))
    await user.click(screen.getByRole('button', { name: 'Расширенные настройки' }))
    const dialog = screen.getByRole('dialog', { name: 'Расширенные настройки' })
    const profileSelect = within(dialog).getByLabelText('Профиль')
    expect(profileSelect).toHaveValue('ummAlQura')
    await user.selectOptions(profileSelect, 'dumRf')
    await user.click(screen.getByRole('button', { name: 'Применить ручной расчёт' }))
    await user.click(within(dialog).getByRole('button', { name: 'Закрыть' }))

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(screen.getByRole('list', { name: 'Расписание дня' })).toBeVisible()
    expect(services.saveCalculationSettings).toHaveBeenLastCalledWith({
      ...DEFAULT_CALCULATION_SETTINGS,
      profile: 'dumRf',
    })
  })

  it('объясняет источники, правила расчёта и часовой пояс', async () => {
    const user = userEvent.setup()
    render(<App services={createServices()} />)

    await user.click(await screen.findByRole('button', { name: 'Настройки' }))
    await user.click(screen.getByRole('button', { name: 'Время намаза' }))
    await user.click(screen.getByRole('button', { name: 'Расширенные настройки' }))
    const methodologyButton = screen.getByRole('button', { name: 'Как рассчитывается время' })
    await user.click(methodologyButton)

    const dialog = screen.getByRole('dialog', { name: 'Как рассчитывается время' })
    expect(within(dialog).getByText(/готовое расписание.+не пересчитывает/i)).toBeVisible()
    expect(within(dialog).getByText(/ДУМ РТ — 18°\/15°.+ДУМ РФ — 16°\/15°/i)).toBeVisible()
    expect(within(dialog).getByText(/120 минут до восхода.+90 минут после заката/i)).toBeVisible()
    expect(within(dialog).getByText(/часовом поясе выбранного места/i)).toBeVisible()
    expect(within(dialog).getByText(/готового расписания ДУМ РТ.+московское время/i)).toBeVisible()

    const officialSourceLink = within(dialog).getByRole('link', { name: 'ДУМ РТ' })
    expect(officialSourceLink).toHaveAttribute(
      'href',
      'https://dumrt.ru/ru/help-info/prayertime/',
    )
    expect(within(dialog).getByRole('link', { name: 'Adhan JS 4.4.6' })).toHaveAttribute(
      'href',
      'https://github.com/batoulapps/adhan-js',
    )
    expect(within(dialog).getByRole('link', { name: 'описание профилей' })).toHaveAttribute(
      'href',
      'https://github.com/batoulapps/adhan-js/blob/master/METHODS.md',
    )
    expect(within(dialog).getByRole('link', { name: 'GeoNames' })).toHaveAttribute(
      'href',
      'https://www.geonames.org/',
    )
    expect(within(dialog).getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by/4.0/',
    )
    expect(within(dialog).getByRole('link', { name: 'OpenStreetMap' })).toHaveAttribute(
      'href',
      'https://www.openstreetmap.org/copyright',
    )
    expect(within(dialog).queryByRole('link', { name: 'Nominatim' })).not.toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: 'Как рассчитывается время' })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Как рассчитывается время' })).toHaveFocus())
  })

  it('открывает методику из настроек и возвращается к ним после закрытия', async () => {
    const user = userEvent.setup()
    render(<App services={createServices()} version="v26.4" />)

    await user.click(await screen.findByRole('button', { name: 'Настройки' }))
    await user.click(screen.getByRole('button', { name: 'Время намаза' }))
    await user.click(screen.getByRole('button', { name: 'Расширенные настройки' }))
    const background = document.querySelector<HTMLElement>('.app-background')
    expect(background).not.toBeNull()
    if (!background) throw new Error('Не найден фон приложения')
    expect(background).toHaveAttribute('inert')
    expect(background).toHaveAttribute('aria-hidden', 'true')
    const settingsDialog = screen.getByRole('dialog', { name: 'Расширенные настройки' })
    const exposureStates: boolean[] = []
    const observer = new MutationObserver(() => {
      exposureStates.push(
        !background.hasAttribute('inert')
        || background.getAttribute('aria-hidden') !== 'true',
      )
    })
    observer.observe(background, {
      attributes: true,
      attributeFilter: ['aria-hidden', 'inert'],
    })
    await user.click(within(settingsDialog).getByRole('button', { name: 'Как рассчитывается время' }))

    expect(screen.queryByRole('dialog', { name: 'Расширенные настройки' })).not.toBeInTheDocument()
    const methodologyDialog = screen.getByRole('dialog', { name: 'Как рассчитывается время' })
    expect(methodologyDialog.closest('[inert]')).toBeNull()
    expect(background).toHaveAttribute('inert')
    await user.click(within(methodologyDialog).getByRole('button', { name: 'Закрыть' }))

    const reopenedSettings = screen.getByRole('dialog', { name: 'Расширенные настройки' })
    expect(background).toHaveAttribute('inert')
    expect(exposureStates).not.toContain(true)
    observer.disconnect()
    await waitFor(() => {
      expect(
        within(reopenedSettings).getByRole('button', { name: 'Как рассчитывается время' }),
      ).toHaveFocus()
    })
  })

  it.each([
    {
      triggerName: /Казань/,
      dialogName: 'Выбор местоположения',
    },
    {
      triggerName: 'Настройки',
      dialogName: 'Настройки',
    },
    {
      triggerName: /Официальное расписание · ДУМ РТ/,
      dialogName: 'Сведения об источнике',
    },
  ])('делает единый фон inert для диалога $dialogName', async ({
    triggerName,
    dialogName,
  }) => {
    const user = userEvent.setup()
    render(<App services={createServices()} version="v26.4" />)

    const trigger = await screen.findByRole('button', { name: triggerName })
    const background = trigger.closest<HTMLElement>('.app-background')
    expect(background).not.toBeNull()
    if (!background) throw new Error('Не найден фон приложения')
    expect(background).toContainElement(document.querySelector('.app-screen'))
    expect(background).toContainElement(screen.getByRole('button', { name: 'Настройки' }))

    const focusStates: boolean[] = []
    trigger.addEventListener('focus', () => focusStates.push(background.hasAttribute('inert')))
    await user.click(trigger)

    const dialog = screen.getByRole('dialog', { name: dialogName })
    expect(background).toHaveAttribute('inert')
    expect(background).toHaveAttribute('aria-hidden', 'true')
    expect(dialog.closest('[inert]')).toBeNull()
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))

    await user.click(within(dialog).getByRole('button', { name: 'Закрыть' }))

    await waitFor(() => expect(trigger).toHaveFocus())
    expect(background).not.toHaveAttribute('inert')
    expect(background).not.toHaveAttribute('aria-hidden')
    expect(focusStates.at(-1)).toBe(false)
  })

  it('удерживает Tab в диалоге и закрывает его по Escape', async () => {
    const user = userEvent.setup()
    render(<App services={createServices()} />)

    await user.click(await screen.findByRole('button', { name: 'Настройки' }))
    await user.click(screen.getByRole('button', { name: 'Время намаза' }))
    await user.click(screen.getByRole('button', { name: 'Расширенные настройки' }))
    await user.click(screen.getByRole('button', { name: '← Назад' }))
    await user.click(screen.getByRole('button', { name: '← Назад' }))
    const shareButton = screen.getByRole('button', { name: 'Поделиться' })
    await user.click(shareButton)
    const dialog = screen.getByRole('dialog', { name: 'QR-код Salah' })
    const copyButton = within(dialog).getByRole('button', { name: 'Скопировать ссылку' })
    const closeButton = within(dialog).getByRole('button', { name: 'Закрыть' })

    await waitFor(() => expect(copyButton).toHaveFocus())
    await user.tab({ shift: true })
    await waitFor(() => expect(closeButton).toHaveFocus())
    await user.tab()
    await waitFor(() => expect(copyButton).toHaveFocus())

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: 'QR-код Salah' })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Поделиться' })).toHaveFocus())
    expect(screen.getByRole('dialog', { name: 'Настройки' })).not.toHaveAttribute('inert')
  })

  it('открывает QR-код для приложения и возвращает фокус после закрытия', async () => {
    const user = userEvent.setup()
    render(<App services={createServices()} />)

    await user.click(await screen.findByRole('button', { name: 'Настройки' }))
    await user.click(screen.getByRole('button', { name: 'Время намаза' }))
    await user.click(screen.getByRole('button', { name: 'Расширенные настройки' }))
    await user.click(screen.getByRole('button', { name: '← Назад' }))
    await user.click(screen.getByRole('button', { name: '← Назад' }))
    const shareButton = screen.getByRole('button', { name: 'Поделиться' })
    expect(shareButton.closest('[role=dialog]')).toHaveAccessibleName('Настройки')

    await user.click(shareButton)

    const dialog = screen.getByRole('dialog', { name: 'QR-код Salah' })
    expect(within(dialog).getByRole('img', { name: 'QR-код со ссылкой на Salah' })).toHaveAttribute(
      'src',
      '/share-qr.svg',
    )
    expect(within(dialog).queryByRole('heading')).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('link')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('Наведите камеру телефона на QR-код')).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/после первого открытия/i)).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Закрыть' }))

    expect(screen.queryByRole('dialog', { name: 'QR-код Salah' })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Поделиться' })).toHaveFocus())
  })

  it('закрывает QR-код по касанию вне модалки', async () => {
    const user = userEvent.setup()
    render(<App services={createServices()} />)

    await user.click(await screen.findByRole('button', { name: 'Настройки' }))
    await user.click(screen.getByRole('button', { name: 'Время намаза' }))
    await user.click(screen.getByRole('button', { name: 'Расширенные настройки' }))
    await user.click(screen.getByRole('button', { name: '← Назад' }))
    await user.click(screen.getByRole('button', { name: '← Назад' }))
    const shareButton = screen.getByRole('button', { name: 'Поделиться' })
    await user.click(shareButton)

    const dialog = screen.getByRole('dialog', { name: 'QR-код Salah' })
    const layer = dialog.parentElement
    if (!layer) throw new Error('Не найден слой диалога')
    fireEvent.pointerDown(layer, { pointerType: 'touch' })

    expect(screen.queryByRole('dialog', { name: 'QR-код Salah' })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Поделиться' })).toHaveFocus())
  })

  it('показывает восстановимую ошибку загрузки', async () => {
    const services = createServices({
      initialize: vi.fn().mockResolvedValue(failure({ kind: 'data', reason: 'offline' })),
    })
    render(<App services={services} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось открыть расписание',
    )
    await waitFor(() => expect(services.initialize).toHaveBeenCalledTimes(1))
  })

  it('позволяет повторить загрузку расписания после ошибки', async () => {
    const baseServices = createServices()
    let shouldFail = true
    const getDays = vi.fn((locationId: string, dates: readonly string[], datasetRevision: string) => {
      if (shouldFail) {
        return Promise.resolve(failure({ kind: 'storage' as const, reason: 'unavailable' as const }))
      }
      return baseServices.getDays(locationId, dates, datasetRevision)
    })
    const services = createServices({ getDays })
    const user = userEvent.setup()
    render(<App services={services} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось загрузить расписание',
    )
    expect(screen.getByText('Расписание временно недоступно')).toBeVisible()
    expect(screen.queryByText('Следующее расписание ещё не опубликовано')).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Расписание дня' })).not.toBeInTheDocument()

    shouldFail = false
    await user.click(screen.getByRole('button', { name: 'Повторить' }))

    expect(await screen.findByRole('list', { name: 'Расписание дня' })).toBeVisible()
    expect(getDays).toHaveBeenCalledTimes(2)
  })
})

describe('согласованность контекста в интерфейсе', () => {
  it('при быстром выборе Казань → Челны → Апастово скрывает прежнюю таблицу и таймер до ответа нужного города', async () => {
    const base = createServices()
    const chelny = deferred<Awaited<ReturnType<AppServices['getDays']>>>()
    const apastovo = deferred<Awaited<ReturnType<AppServices['getDays']>>>()
    const services = createServices({
      initialize: vi.fn().mockResolvedValue(initialized({ meta: { ...initializedState.meta, locations: [
        ...initializedState.meta.locations,
        { id: 'apastovo', name: 'Апастово', latitude: 55.2, longitude: 48.5 },
      ] } })),
      getDays: vi.fn((id: string, dates: readonly string[], revision: string) => id === 'naberezhnye-chelny' ? chelny.promise : id === 'apastovo' ? apastovo.promise : base.getDays(id, dates, revision)),
    })
    const user = userEvent.setup()
    const { container } = render(<App services={services} />)
    expect(await screen.findByRole('timer')).toBeVisible()
    await user.click(screen.getByRole('button', { name: /Казань/ }))
    await user.click(screen.getByRole('button', { name: 'Набережные Челны' }))
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Расписание дня' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Набережные Челны/ }))
    await user.click(screen.getByRole('button', { name: 'Апастово' }))
    await act(async () => { chelny.resolve(success([undefined, chelnyToday, undefined])); await chelny.promise })
    expect(screen.getByRole('button', { name: /Апастово/ })).toBeVisible()
    expect(screen.getByLabelText('Загружаем расписание')).toBeVisible()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(container.querySelector('[data-active]')).toBeNull()
    await act(async () => { apastovo.resolve(success([undefined, { ...kazanToday, locationId: 'apastovo', asr: '16:45' }, undefined])); await apastovo.promise })
    expect(await within(screen.getByRole('list')).findByText('16:45')).toBeVisible()
    expect(screen.queryByText('16:37')).not.toBeInTheDocument()
    expect(screen.getByRole('timer')).toBeVisible()
  })
})

it('selects manual calculation independently of city and returns to automatic in one action', async () => {
  const user = userEvent.setup()
  const services = createServices()
  render(<App services={services} />)
  await user.click(await screen.findByRole('button', { name: 'Настройки' }))
    await user.click(screen.getByRole('button', { name: 'Время намаза' }))
    await user.click(screen.getByRole('button', { name: 'Расширенные настройки' }))
  expect(screen.getByText(/Автоматический выбор источника будет отключён/)).toBeVisible()
  await user.selectOptions(screen.getByLabelText('Профиль'), 'karachi')
  await user.click(screen.getByRole('button', { name: 'Применить ручной расчёт' }))
  await user.click(screen.getByRole('button', { name: '← Назад' }))
  expect(screen.getByLabelText('Источник')).toHaveValue('calculated')
  await user.click(screen.getByRole('button', { name: 'Закрыть' }))
  expect(await screen.findByText('Фаджр')).toBeVisible()
  expect(screen.queryByText('Утренний намаз в мечетях')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /Казань/ }))
  await user.click(screen.getByText('Татарстан', { exact: true }))
  await user.click(screen.getByRole('button', { name: 'Набережные Челны' }))
  await user.click(screen.getByRole('button', { name: 'Настройки' }))
  await user.click(screen.getByRole('button', { name: 'Время намаза' }))
  expect(screen.getByLabelText('Источник')).toHaveValue('calculated')
  await user.click(screen.getByRole('button', { name: 'Вернуться к автоматическому выбору' }))
  expect(screen.getByLabelText('Источник')).toHaveValue('automatic')
  await user.click(screen.getByRole('button', { name: 'Закрыть' }))
  expect(await screen.findByText('Утренний намаз в мечетях')).toBeVisible()
  expect(vi.mocked(services.saveSettings).mock.lastCall?.[0].sourcePreferences).toMatchObject({ mode: 'automatic' })
})

it('allows calculated cold start without meta while the official refresh is hanging', async () => {
  const user = userEvent.setup()
  const services = createServices({ initialize: vi.fn().mockResolvedValue(initialized({ meta: null, dataState: 'not-loaded' })), refresh: vi.fn<AppServices['refresh']>(() => new Promise(() => {})) })
  render(<App services={services} />)
  await user.click(await screen.findByRole('button', { name: /Казань/ }))
  await user.click(screen.getByRole('button', { name: 'Найти город или район' }))
  await user.type(screen.getByRole('searchbox'), 'Стамбул')
  await user.click(await screen.findByRole('button', { name: 'Стамбул, Стамбул, Турция' }))
  expect(await screen.findByText('Фаджр')).toBeVisible()
  expect(screen.getByRole('button', { name: /Расчётное время/ })).toBeVisible()
  expect(services.getDays).not.toHaveBeenCalled()
})

it.each(['rejection', 'result'] as const)('shows one nonblocking persistence notice for %s and retry writes current settings', async kind => {
  const user = userEvent.setup()
  const save = vi.fn<AppServices['saveSettings']>().mockImplementationOnce(() => kind === 'rejection' ? Promise.reject(new Error('quota')) : Promise.resolve(failure({ kind: 'storage', reason: 'unavailable' }))).mockResolvedValue(success(undefined))
  const services = createServices({ saveSettings: save })
  render(<App services={services} />)
  await user.click(await screen.findByRole('button', { name: 'Настройки' }))
    await user.click(screen.getByRole('button', { name: 'Время намаза' }))
    await user.click(screen.getByRole('button', { name: 'Расширенные настройки' }))
  await user.selectOptions(screen.getByLabelText('Профиль'), 'karachi')
  await user.click(screen.getByRole('button', { name: 'Применить ручной расчёт' }))
  await user.click(screen.getByRole('button', { name: '← Назад' }))
  expect(await screen.findByText('Изменение действует сейчас, но сохранить его не удалось')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Повторить' }))
  await waitFor(() => expect(screen.queryByText('Изменение действует сейчас, но сохранить его не удалось')).not.toBeInTheDocument())
  expect(save.mock.lastCall?.[0].sourcePreferences).toMatchObject({ mode: 'manual', source: { kind: 'calculated', calculation: { profile: 'karachi' } } })
  expect(screen.getByLabelText('Источник')).toHaveValue('calculated')
})

it('automatic expiration calculates but manual official expiration remains explicitly unavailable', async () => {
  const user = userEvent.setup()
  render(<App services={createServices()} />)
  await screen.findByText('Утренний намаз в мечетях')
  fireEvent.change(screen.getByLabelText('Выбрать дату'), { target: { value: '2027-01-01' } })
  expect(await screen.findByText('Фаджр')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Настройки' }))
  await user.click(screen.getByRole('button', { name: 'Время намаза' }))
  await user.selectOptions(screen.getByLabelText('Источник'), 'dumRt')
  await user.click(screen.getByRole('button', { name: 'Закрыть' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('не покрывает это место или дату')
  expect(screen.queryByText('Фаджр')).not.toBeInTheDocument()
})

it('повторяет сохранение оформления и показывает его текущее действие', async () => {
  const user = userEvent.setup()
  const saveSettings = vi.fn<AppServices['saveSettings']>().mockResolvedValueOnce(failure({kind:'storage',reason:'unavailable'})).mockResolvedValue(success(undefined))
  render(<App services={createServices({saveSettings})} />)
  await user.click(await screen.findByRole('button', {name:'Настройки'}))
  expect(screen.getByLabelText('Оформление')).toHaveValue('system')
  await user.selectOptions(screen.getByLabelText('Оформление'), 'dark')
  expect(document.documentElement.dataset.theme).toBe('dark')
  expect(await screen.findByText('Изменение действует сейчас, но сохранить его не удалось')).toBeVisible()
  await user.click(screen.getByRole('button', {name:'Повторить'}))
  await waitFor(() => expect(saveSettings).toHaveBeenCalledTimes(2))
  expect(saveSettings.mock.lastCall?.[0]).toEqual({appearance:'dark'})
})
