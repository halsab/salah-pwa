import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { App, type AppServices } from './App'
import type { CityCatalog } from './data/cityCatalog'
import type { PrayerRepositoryState } from './data/prayerRepository'
import {
  getCountryGroups,
  searchCities,
  type City,
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
    [745044, 'Стамбул', 'стамбул истанбул istanbul турция', 'TR', '34', 41.0138, 28.9497, 15_701_602, 'Europe/Istanbul'],
    [524901, 'Москва', 'москва москву moscow россия', 'RU', '48', 55.7522, 37.6156, 10_381_222, 'Europe/Moscow'],
    [551487, 'Казань', 'казань kazan россия татарстан', 'RU', '73', 55.7946, 49.1115, 1_308_660, 'Europe/Moscow'],
  ],
}

const initializedState: PrayerRepositoryState = {
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
  calculationSettings: DEFAULT_CALCULATION_SETTINGS,
  warning: null,
}

function initialized(overrides: Partial<PrayerRepositoryState> = {}) {
  return success({ ...initializedState, ...overrides })
}

function deferred<Value>() {
  let resolve!: (value: Value) => void
  const promise = new Promise<Value>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

function createServices(
  overrides: Partial<AppServices> = {},
): AppServices {
  const days = [kazanToday, kazanTomorrow, chelnyToday]

  return {
    initialize: vi.fn().mockResolvedValue(initialized()),
    cities: {
      load: vi.fn().mockResolvedValue(success({
        source: cityDataset.source,
        countryGroups: getCountryGroups(cityDataset),
      })),
      search: vi.fn().mockImplementation((query: string) =>
        Promise.resolve(success(searchCities(cityDataset, query))),
      ),
      findNearest: vi.fn().mockResolvedValue(success(null)),
    },
    getDay: vi
      .fn()
      .mockImplementation((locationId: string, date: string) =>
        Promise.resolve(success(
          days.find((day) => day.locationId === locationId && day.date === date),
        )),
      ),
    saveOfficialLocation: vi.fn().mockResolvedValue(success(undefined)),
    saveCalculatedLocation: vi.fn().mockResolvedValue(success(undefined)),
    saveCalculationSettings: vi.fn().mockResolvedValue(success(undefined)),
    resolvePlaceName: vi.fn().mockResolvedValue(success({
      name: 'Набережные Челны, Россия',
      regionEvidence: { source: 'nominatim', regionCode: 'RU-TA' },
    })),
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
  it('показывает номер релизной сборки внизу приложения', async () => {
    render(<App services={createServices()} version="v26.4" />)

    await screen.findByRole('button', { name: /Казань/ })

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
          nameSource: 'geonames',
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
    const schedule = await screen.findByRole('list', { name: 'Времена намаза' })
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

  it('показывает текущее событие, выделяет его и считает до следующего', async () => {
    render(<App services={createServices()} />)

    expect(await screen.findByRole('button', { name: /Казань/ })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Salah' })).toBeVisible()
    expect(await screen.findByText('До асра')).toBeVisible()
    expect(screen.getByText('Последнее событие')).toBeVisible()
    expect(screen.queryByText('Сейчас')).not.toBeInTheDocument()
    expect(screen.getByText('Зухр · 12:00')).toBeVisible()
    expect(screen.getByText('03:24:00')).toBeVisible()

    const schedule = screen.getByRole('list', { name: 'Времена намаза' })
    expect(within(schedule).getAllByRole('listitem')).toHaveLength(8)
    expect(within(schedule).getByText('Завершение сухура')).toBeVisible()
    expect(within(schedule).getByText(/в мечетях/i)).toBeVisible()
    expect(within(schedule).getByText('20:33')).toBeVisible()
    expect(within(schedule).getByText('Зухр').closest('li')).toHaveAttribute('data-active', 'true')
    expect(within(schedule).getByText('Аср').closest('li')).not.toHaveAttribute('data-active')
    expect(within(schedule).queryByLabelText('Текущий намаз')).not.toBeInTheDocument()
    expect(document.querySelector('.source-note')).toHaveTextContent(/Официальное расписание ДУМ РТ/i)
    expect(screen.queryByText(/Координаты и выбранный город/i)).not.toBeInTheDocument()
  })

  it('выделяет зенит и считает до зухра', async () => {
    render(<App services={createServices({
      now: () => new Date('2026-09-01T08:50:00.000Z'),
    })} />)

    expect(await screen.findByText('Зенит · 11:44')).toBeVisible()
    expect(screen.getByText('До зухра')).toBeVisible()
    expect(screen.getByText('00:10:00')).toBeVisible()

    const schedule = screen.getByRole('list', { name: 'Времена намаза' })
    expect(within(schedule).getByText('Зенит').closest('li')).toHaveAttribute('data-active', 'true')
    expect(within(schedule).getByText('Зухр').closest('li')).not.toHaveAttribute('data-active')
  })

  it('точно переключает текущее и следующее событие на его границе', async () => {
    let now = new Date('2026-09-01T13:23:59.000Z')
    const services = createServices({ now: () => new Date(now) })
    render(<App services={services} />)

    expect(await screen.findByText('Зухр · 12:00')).toBeVisible()
    expect(screen.getByText('До асра')).toBeVisible()
    expect(screen.getByText('00:00:01')).toBeVisible()

    now = new Date(now.getTime() + 1_000)
    await new Promise((resolve) => setTimeout(resolve, 1_100))

    expect(screen.getByText('Аср · 16:24')).toBeVisible()
    expect(screen.getByText('До магриба')).toBeVisible()
    expect(screen.getByText('02:15:00')).toBeVisible()
    expect(
      screen.getByRole('list', { name: 'Времена намаза' })
        .querySelector('[data-active="true"] .prayer-name'),
    ).toHaveTextContent('Аср')
  })

  it('для утреннего намаза использует уточнённую подпись таймера', async () => {
    render(<App services={createServices({
      now: () => new Date('2026-09-01T00:00:00.000Z'),
    })} />)

    expect(await screen.findByText('Завершение сухура · 02:21')).toBeVisible()
    expect(screen.getByText('До утреннего в мечети')).toBeVisible()
  })

  it('при просмотре другой даты скрывает таймер и показывает кнопку Сегодня', async () => {
    const user = userEvent.setup()
    render(<App services={createServices()} />)

    await screen.findByText('Зухр · 12:00')
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
    await waitFor(() => expect(services.getDay).toHaveBeenCalledTimes(3))
    vi.mocked(services.getDay).mockClear()

    act(() => {
      now = new Date('2026-08-31T21:00:00.000Z')
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(await screen.findByText('вторник, 1 сентября')).toBeVisible()
    await waitFor(() => {
      expect(services.getDay).toHaveBeenCalledWith('kazan', '2026-09-01')
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
    expect(services.getDay).toHaveBeenCalledWith('kazan', '2026-09-01')
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

    expect(await screen.findByRole('button', { name: /Набережные Челны/ })).toBeVisible()
    expect(services.getPermission).toHaveBeenCalledTimes(1)
    expect(services.getPosition).toHaveBeenNthCalledWith(1, 'coarse')
    expect(services.getPosition).toHaveBeenNthCalledWith(2, 'precise')
    expect(services.saveOfficialLocation).toHaveBeenCalledWith(
      'naberezhnye-chelny',
      'automatic',
    )
    expect(services.cities.load).not.toHaveBeenCalled()
    expect(services.cities.search).not.toHaveBeenCalled()
    expect(services.cities.findNearest).not.toHaveBeenCalled()
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
    await act(async () => permission.resolve('granted'))

    expect(await screen.findByRole('button', { name: /Набережные Челны/ })).toBeVisible()
    expect(services.getPosition).not.toHaveBeenCalled()
    expect(services.saveOfficialLocation).toHaveBeenCalledTimes(1)
    expect(services.saveOfficialLocation).toHaveBeenCalledWith('naberezhnye-chelny', 'manual')
  })

  it('игнорирует поздние координаты после ручного выбора', async () => {
    const coarse = deferred<Awaited<ReturnType<AppServices['getPosition']>>>()
    const services = createServices({
      getPosition: vi.fn()
        .mockReturnValueOnce(coarse.promise)
        .mockResolvedValue(success({
          latitude: 55.7946,
          longitude: 49.1115,
          accuracy: 10,
          timestamp: 200,
        })),
    })
    const user = userEvent.setup()
    render(<App services={services} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    await user.click(screen.getByRole('button', { name: 'Определить автоматически' }))
    await waitFor(() => expect(services.getPosition).toHaveBeenCalledWith('coarse'))
    await user.click(screen.getByRole('button', { name: 'Набережные Челны' }))
    await act(async () => coarse.resolve(success({
      latitude: 55.7946,
      longitude: 49.1115,
      accuracy: 500,
      timestamp: 100,
    })))

    expect(await screen.findByRole('button', { name: /Набережные Челны/ })).toBeVisible()
    expect(services.getPosition).toHaveBeenCalledTimes(1)
    expect(services.resolvePlaceName).not.toHaveBeenCalled()
    expect(services.saveOfficialLocation).toHaveBeenCalledTimes(1)
    expect(services.saveOfficialLocation).toHaveBeenCalledWith('naberezhnye-chelny', 'manual')
  })

  it('игнорирует позднее подтверждение региона после ручного выбора', async () => {
    const reverse = deferred<Awaited<ReturnType<AppServices['resolvePlaceName']>>>()
    const position = success({
      latitude: 55.7946,
      longitude: 49.1115,
      accuracy: 10,
      timestamp: 200,
    })
    const services = createServices({
      getPosition: vi.fn().mockResolvedValue(position),
      resolvePlaceName: vi.fn().mockReturnValue(reverse.promise),
    })
    const user = userEvent.setup()
    render(<App services={services} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    await user.click(screen.getByRole('button', { name: 'Определить автоматически' }))
    await waitFor(() => expect(services.resolvePlaceName).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole('button', { name: 'Набережные Челны' }))
    await act(async () => reverse.resolve(success({
      name: 'Казань, Россия',
      regionEvidence: { source: 'nominatim', regionCode: 'RU-TA' },
    })))

    expect(await screen.findByRole('button', { name: /Набережные Челны/ })).toBeVisible()
    expect(services.saveOfficialLocation).toHaveBeenCalledTimes(1)
    expect(services.saveOfficialLocation).toHaveBeenCalledWith('naberezhnye-chelny', 'manual')
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
    expect(screen.getByText('16:37')).toBeVisible()
    expect(services.saveOfficialLocation).toHaveBeenCalledWith('naberezhnye-chelny', 'manual')
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
    let resolveCities!: (value: ReturnType<typeof success<CityCatalog>>) => void
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

    resolveCities!(success({
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
      expect(await screen.findByRole('button', { name: 'Стамбул, Турция' })).toBeVisible()
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

    expect(await screen.findByRole('button', { name: /Набережные Челны/ })).toBeVisible()
    expect(services.getPosition).toHaveBeenNthCalledWith(1, 'coarse')
    expect(services.getPosition).toHaveBeenNthCalledWith(2, 'precise')
    expect(services.getPosition).toHaveBeenCalledTimes(2)
    expect(services.getPermission).not.toHaveBeenCalled()
    expect(services.cities.load).not.toHaveBeenCalled()
    expect(services.cities.search).not.toHaveBeenCalled()
    expect(services.cities.findNearest).not.toHaveBeenCalled()
    expect(services.saveOfficialLocation).toHaveBeenCalledWith(
      'naberezhnye-chelny',
      'automatic',
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
      resolvePlaceName: vi.fn().mockResolvedValue(success({
        name: 'Москва, Россия',
        regionEvidence: { source: 'nominatim', regionCode: 'RU-MOW' },
      })),
    })
    render(<App services={services} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    await user.click(screen.getByRole('button', { name: 'Определить автоматически' }))

    expect(await screen.findByRole('button', { name: /Москва, Россия/i })).toBeVisible()
    const schedule = screen.getByRole('list', { name: 'Времена намаза' })
    expect(within(schedule).getAllByRole('listitem')).toHaveLength(7)
    expect(within(schedule).getByText('Фаджр')).toBeVisible()
    expect(within(schedule).queryByText(/сухура/i)).not.toBeInTheDocument()
    expect(within(schedule).queryByText(/в мечетях/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Расчёт по настройкам · ДУМ РТ/i)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Методика' })).toBeVisible()
    expect(services.getPosition).toHaveBeenNthCalledWith(1, 'coarse')
    expect(services.getPosition).toHaveBeenNthCalledWith(2, 'precise')
    expect(services.saveCalculatedLocation).toHaveBeenCalledWith({
      ...precise,
      timeZone: 'Europe/Moscow',
      name: 'Москва, Россия',
      nameSource: 'nominatim',
      source: 'gps',
    }, 'automatic')
    expect(services.cities.load).not.toHaveBeenCalled()
    expect(services.cities.search).not.toHaveBeenCalled()
    expect(services.cities.findNearest).not.toHaveBeenCalled()
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
      resolvePlaceName: vi.fn().mockResolvedValue(failure({
        kind: 'data',
        reason: 'offline',
      })),
    })
    render(<App services={services} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    await user.click(screen.getByRole('button', { name: 'Определить автоматически' }))

    expect(await screen.findByText('Фаджр')).toBeVisible()
    expect(services.saveCalculatedLocation).toHaveBeenCalledWith({
      ...coarse,
      timeZone: 'Europe/Moscow',
      source: 'gps',
    }, 'automatic')
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
      resolvePlaceName: vi.fn().mockResolvedValue(failure({
        kind: 'data',
        reason: 'offline',
      })),
      getDeviceTimeZone: () => 'America/Los_Angeles',
    })
    render(<App services={services} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    expect(services.cities.load).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Определить автоматически' }))

    expect(await screen.findByRole('button', { name: /Текущее местоположение/ })).toBeVisible()
    expect(screen.getByRole('list', { name: 'Времена намаза' }).children).toHaveLength(7)
    expect(services.saveCalculatedLocation).toHaveBeenCalledWith({
      ...precise,
      timeZone: 'America/Los_Angeles',
      source: 'gps',
    }, 'automatic')
    expect(services.cities.load).not.toHaveBeenCalled()
    expect(services.cities.search).not.toHaveBeenCalled()
    expect(services.cities.findNearest).not.toHaveBeenCalled()
  })

  it('ищет и выбирает город из офлайн-справочника', async () => {
    const user = userEvent.setup()
    const services = createServices()
    render(<App services={services} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    await user.click(screen.getByRole('button', { name: 'Найти город или район' }))
    await user.type(screen.getByRole('searchbox'), 'Стамбул')
    expect(await screen.findByText('Турция', { exact: true })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Стамбул, Турция' }))

    expect(await screen.findByRole('button', { name: /Стамбул, Турция/ })).toBeVisible()
    expect(services.saveCalculatedLocation).toHaveBeenCalledWith({
      latitude: 41.0138,
      longitude: 28.9497,
      timeZone: 'Europe/Istanbul',
      accuracy: null,
      timestamp: 1_788_256_800_000,
      name: 'Стамбул, Турция',
      cityId: 745044,
      nameSource: 'geonames',
      source: 'preset',
    }, 'manual')
  })

  it('назначает официальное расписание только городу GeoNames из RU.73', async () => {
    const user = userEvent.setup()
    const services = createServices()
    render(<App services={services} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    await user.click(screen.getByRole('button', { name: 'Найти город или район' }))
    await user.type(screen.getByRole('searchbox'), 'Казань')
    await user.click(await screen.findByRole('button', { name: 'Казань, Россия' }))

    expect(services.saveOfficialLocation).toHaveBeenCalledWith('kazan', 'manual')
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

  it('показывает статус поиска и сохраняет группировку по странам', async () => {
    const user = userEvent.setup()
    let resolveSearch!: (cities: ReturnType<typeof success<City[]>>) => void
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
    resolveSearch!(success(searchCities(cityDataset, 'Москва')))

    expect(await screen.findByText('Россия', { exact: true })).toBeVisible()
    expect(screen.getByText('Найдено вариантов: 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Москва, Россия' })).toBeVisible()
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
    expect(within(searchDialog).getByRole('button', { name: 'Стамбул, Турция' })).toBeVisible()
  })

  it('отправляет округлённую геопозицию во внешний сервис только по кнопке и кеширует название', async () => {
    const user = userEvent.setup()
    const calculatedLocation = {
      latitude: 55.7558,
      longitude: 37.6173,
      timeZone: 'Europe/Moscow',
      accuracy: 12,
      timestamp: 200,
      name: 'Moscow, Россия',
      cityId: 524901,
      nameSource: 'geonames' as const,
      source: 'gps' as const,
    }
    const services = createServices({
      initialize: vi.fn().mockResolvedValue(initialized({
        locationChoice: {
          mode: 'calculated',
          source: 'manual',
          coordinates: calculatedLocation,
        },
      })),
      resolvePlaceName: vi.fn().mockResolvedValue(success({
        name: 'Москва, Россия',
        regionEvidence: { source: 'nominatim', regionCode: 'RU-MOW' },
      })),
    })
    render(<App services={services} />)

    expect(await screen.findByRole('button', { name: /Moscow, Россия/ })).toBeVisible()
    expect(services.resolvePlaceName).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /Moscow, Россия/ }))
    expect(screen.queryByText(/приблизительные координаты передаются OpenStreetMap/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Уточнить название онлайн' }))

    expect(services.resolvePlaceName).toHaveBeenCalledWith(calculatedLocation)
    expect(services.saveCalculatedLocation).toHaveBeenCalledWith({
      ...calculatedLocation,
      name: 'Москва, Россия',
      nameSource: 'nominatim',
    }, 'manual')
    expect(screen.getByText('Москва, Россия')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Название уточнено онлайн' })).toBeDisabled()
  })

  it('игнорирует позднее уточнение названия после нового ручного выбора', async () => {
    const calculatedLocation = {
      latitude: 55.7558,
      longitude: 37.6173,
      timeZone: 'Europe/Moscow',
      accuracy: 12,
      timestamp: 200,
      source: 'gps' as const,
    }
    const reverse = deferred<Awaited<ReturnType<AppServices['resolvePlaceName']>>>()
    const services = createServices({
      initialize: vi.fn().mockResolvedValue(initialized({
        locationChoice: {
          mode: 'calculated',
          source: 'manual',
          coordinates: calculatedLocation,
        },
      })),
      resolvePlaceName: vi.fn().mockReturnValue(reverse.promise),
    })
    const user = userEvent.setup()
    render(<App services={services} />)

    await user.click(await screen.findByRole('button', { name: /Текущее местоположение/ }))
    await user.click(screen.getByRole('button', { name: 'Уточнить название онлайн' }))
    await waitFor(() => expect(services.resolvePlaceName).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole('button', { name: 'Набережные Челны' }))
    await act(async () => reverse.resolve(success({
      name: 'Москва, Россия',
      regionEvidence: { source: 'nominatim', regionCode: 'RU-MOW' },
    })))

    expect(await screen.findByRole('button', { name: /Набережные Челны/ })).toBeVisible()
    expect(services.saveCalculatedLocation).not.toHaveBeenCalled()
    expect(services.saveOfficialLocation).toHaveBeenCalledWith('naberezhnye-chelny', 'manual')
  })

  it('сохраняет Аср, профиль и северное правило независимо', async () => {
    const user = userEvent.setup()
    const services = createServices()
    render(<App services={services} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    await user.click(screen.getByRole('button', { name: 'Найти город или район' }))
    await user.type(screen.getByRole('searchbox'), 'Стамбул')
    await user.click(await screen.findByRole('button', { name: 'Стамбул, Турция' }))
    expect(await screen.findByRole('button', { name: /Стамбул, Турция/ })).toBeVisible()

    await user.click(await screen.findByRole('button', { name: 'Настройки автономного расчёта' }))
    const dialog = screen.getByRole('dialog', { name: 'Настройки расчёта' })
    expect(within(dialog).getByText(/Сейчас расписание пересчитывается/i)).toBeVisible()
    const asrSelect = within(dialog).getByLabelText('Аср')
    expect(asrSelect).toBeEnabled()
    expect(within(asrSelect).getByRole('option', { name: 'Ханафитский' })).toBeVisible()
    expect(within(asrSelect).getByRole('option', {
      name: 'Шафиитский, маликитский и ханбалитский',
    })).toBeVisible()
    expect(within(asrSelect).queryByRole('option', { name: 'Стандартный' })).not.toBeInTheDocument()
    await user.selectOptions(asrSelect, 'standard')
    await user.selectOptions(within(dialog).getByLabelText('Профиль'), 'dumRf')
    await user.selectOptions(within(dialog).getByLabelText('Северные правила'), 'seventhOfNight')

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

    await user.click(await screen.findByRole('button', { name: 'Настройки автономного расчёта' }))
    const dialog = screen.getByRole('dialog', { name: 'Настройки расчёта' })

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

    await user.click(screen.getByRole('button', { name: 'Настройки автономного расчёта' }))
    const dialog = screen.getByRole('dialog', { name: 'Настройки расчёта' })
    const profileSelect = within(dialog).getByLabelText('Профиль')
    expect(profileSelect).toHaveValue('ummAlQura')
    await user.selectOptions(profileSelect, 'dumRf')
    await user.click(within(dialog).getByRole('button', { name: 'Закрыть' }))

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(screen.getByRole('list', { name: 'Времена намаза' })).toBeVisible()
    expect(services.saveCalculationSettings).toHaveBeenLastCalledWith({
      ...DEFAULT_CALCULATION_SETTINGS,
      profile: 'dumRf',
    })
  })

  it('объясняет источники, правила расчёта и часовой пояс', async () => {
    const user = userEvent.setup()
    render(<App services={createServices()} />)

    const methodologyButton = await screen.findByRole('button', { name: 'Методика' })
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
    expect(within(dialog).getByRole('link', { name: 'Nominatim' })).toHaveAttribute(
      'href',
      'https://nominatim.org/',
    )

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: 'Как рассчитывается время' })).not.toBeInTheDocument()
    await waitFor(() => expect(methodologyButton).toHaveFocus())
  })

  it('открывает методику из настроек и возвращается к ним после закрытия', async () => {
    const user = userEvent.setup()
    render(<App services={createServices()} version="v26.4" />)

    await user.click(await screen.findByRole('button', { name: 'Настройки автономного расчёта' }))
    const background = document.querySelector<HTMLElement>('.app-background')
    expect(background).not.toBeNull()
    expect(background).toHaveAttribute('inert')
    expect(background).toHaveAttribute('aria-hidden', 'true')
    const settingsDialog = screen.getByRole('dialog', { name: 'Настройки расчёта' })
    const exposureStates: boolean[] = []
    const observer = new MutationObserver(() => {
      exposureStates.push(
        !background?.hasAttribute('inert')
        || background.getAttribute('aria-hidden') !== 'true',
      )
    })
    observer.observe(background!, {
      attributes: true,
      attributeFilter: ['aria-hidden', 'inert'],
    })
    await user.click(within(settingsDialog).getByRole('button', { name: 'Как рассчитывается время' }))

    expect(screen.queryByRole('dialog', { name: 'Настройки расчёта' })).not.toBeInTheDocument()
    const methodologyDialog = screen.getByRole('dialog', { name: 'Как рассчитывается время' })
    expect(methodologyDialog.closest('[inert]')).toBeNull()
    expect(background).toHaveAttribute('inert')
    await user.click(within(methodologyDialog).getByRole('button', { name: 'Закрыть' }))

    const reopenedSettings = screen.getByRole('dialog', { name: 'Настройки расчёта' })
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
      triggerName: 'Настройки автономного расчёта',
      dialogName: 'Настройки расчёта',
    },
    {
      triggerName: 'Методика',
      dialogName: 'Как рассчитывается время',
    },
    {
      triggerName: 'Поделиться',
      dialogName: 'QR-код Salah',
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
    expect(background).toContainElement(document.querySelector('.app-frame'))
    expect(background).toContainElement(screen.getByRole('button', { name: 'Поделиться' }))
    expect(background).toContainElement(screen.getByText('v26.4'))

    const focusStates: boolean[] = []
    trigger.addEventListener('focus', () => focusStates.push(background!.hasAttribute('inert')))
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

    const shareButton = await screen.findByRole('button', { name: 'Поделиться' })
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
    await waitFor(() => expect(shareButton).toHaveFocus())
    expect(shareButton.closest('.app-background')).not.toHaveAttribute('inert')
  })

  it('открывает QR-код для приложения и возвращает фокус после закрытия', async () => {
    const user = userEvent.setup()
    render(<App services={createServices()} />)

    const shareButton = await screen.findByRole('button', { name: 'Поделиться' })
    expect(document.querySelector('.app-frame')?.nextElementSibling).toBe(shareButton)

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
    await waitFor(() => expect(shareButton).toHaveFocus())
  })

  it('закрывает QR-код по касанию вне модалки', async () => {
    const user = userEvent.setup()
    render(<App services={createServices()} />)

    const shareButton = await screen.findByRole('button', { name: 'Поделиться' })
    await user.click(shareButton)

    const dialog = screen.getByRole('dialog', { name: 'QR-код Salah' })
    fireEvent.pointerDown(dialog.parentElement!, { pointerType: 'touch' })

    expect(screen.queryByRole('dialog', { name: 'QR-код Salah' })).not.toBeInTheDocument()
    await waitFor(() => expect(shareButton).toHaveFocus())
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
    const getDay = vi.fn((locationId: string, date: string) => {
      if (shouldFail) {
        return Promise.resolve(failure({ kind: 'storage' as const, reason: 'unavailable' as const }))
      }
      return baseServices.getDay(locationId, date)
    })
    const services = createServices({ getDay })
    const user = userEvent.setup()
    render(<App services={services} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось загрузить расписание',
    )
    expect(screen.getByText('Расписание временно недоступно')).toBeVisible()
    expect(screen.queryByText('Следующее расписание ещё не опубликовано')).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Времена намаза' })).not.toBeInTheDocument()

    shouldFail = false
    await user.click(screen.getByRole('button', { name: 'Повторить' }))

    expect(await screen.findByRole('list', { name: 'Времена намаза' })).toBeVisible()
    expect(getDay).toHaveBeenCalledTimes(6)
  })
})
