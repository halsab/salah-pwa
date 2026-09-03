import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { App, type AppServices } from './App'
import type { CityCatalog } from './data/cityCatalog'
import {
  findNearestCity,
  getCountryGroups,
  searchCities,
  type CityDataset,
} from './domain/cities'
import { DEFAULT_CALCULATION_SETTINGS } from './domain/prayerCalculation'
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
    {
      id: 745044,
      name: 'Istanbul',
      searchNames: 'Стамбул Истанбул',
      countryCode: 'TR',
      latitude: 41.0138,
      longitude: 28.9497,
      population: 15_701_602,
    },
    {
      id: 524901,
      name: 'Moscow',
      searchNames: 'Москва Москву',
      countryCode: 'RU',
      latitude: 55.7522,
      longitude: 37.6156,
      population: 10_381_222,
    },
  ],
}

function createServices(
  overrides: Partial<AppServices> = {},
): AppServices {
  const days = [kazanToday, kazanTomorrow, chelnyToday]

  return {
    initialize: vi.fn().mockResolvedValue({
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
      locationId: 'kazan',
      locationMode: 'official',
      calculatedLocation: null,
      calculationSettings: DEFAULT_CALCULATION_SETTINGS,
    }),
    cities: {
      load: vi.fn().mockResolvedValue({
        source: cityDataset.source,
        countryGroups: getCountryGroups(cityDataset),
      }),
      search: vi.fn().mockImplementation((query: string) =>
        Promise.resolve(searchCities(cityDataset, query)),
      ),
      findNearest: vi.fn().mockImplementation((
        latitude: number,
        longitude: number,
        maxDistanceKm: number,
      ) => Promise.resolve(
        findNearestCity(latitude, longitude, cityDataset.cities, maxDistanceKm),
      )),
    },
    getDay: vi
      .fn()
      .mockImplementation((locationId: string, date: string) =>
        Promise.resolve(
          days.find((day) => day.locationId === locationId && day.date === date),
        ),
      ),
    saveOfficialLocation: vi.fn().mockResolvedValue(undefined),
    saveCalculatedLocation: vi.fn().mockResolvedValue(undefined),
    saveCalculationSettings: vi.fn().mockResolvedValue(undefined),
    resolvePlaceName: vi.fn().mockResolvedValue('Москва, Россия'),
    getPermission: vi.fn().mockResolvedValue('prompt'),
    getPosition: vi.fn().mockResolvedValue({
      latitude: 55.742,
      longitude: 52.3992,
      accuracy: 500,
      timestamp: 1_788_265_600_000,
    }),
    now: () => new Date('2026-09-01T10:00:00.000Z'),
    ...overrides,
  }
}

describe('Salah', () => {
  it('показывает текущее событие, выделяет его и считает до следующего', async () => {
    render(<App services={createServices()} />)

    expect(await screen.findByRole('button', { name: /Казань/ })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Salah' })).toBeVisible()
    expect(await screen.findByText('До асра')).toBeVisible()
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
    let now = new Date('2026-09-01T10:00:00.000Z')
    const services = createServices({ now: () => new Date(now) })
    render(<App services={services} />)

    expect(await screen.findByText('вторник, 1 сентября')).toBeVisible()

    act(() => {
      now = new Date('2026-09-02T10:00:00.000Z')
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(await screen.findByText('среда, 2 сентября')).toBeVisible()
    await waitFor(() => {
      expect(services.getDay).toHaveBeenCalledWith('kazan', '2026-09-02')
    })
  })

  it('после возврата сохраняет вручную выбранную дату', async () => {
    let now = new Date('2026-09-01T10:00:00.000Z')
    const services = createServices({ now: () => new Date(now) })
    const user = userEvent.setup()
    render(<App services={services} />)

    await screen.findByText('вторник, 1 сентября')
    await user.click(screen.getByRole('button', { name: 'Предыдущий день' }))
    expect((await screen.findAllByText('понедельник, 31 августа'))[0]).toBeVisible()

    act(() => {
      now = new Date('2026-09-02T10:00:00.000Z')
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect((await screen.findAllByText('понедельник, 31 августа'))[0]).toBeVisible()
    expect(screen.getAllByRole('button', { name: 'Сегодня' })[0]).toBeVisible()
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
    expect(services.saveOfficialLocation).toHaveBeenCalledWith('naberezhnye-chelny')
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

  it('загружает города только после открытия выбора местоположения', async () => {
    const user = userEvent.setup()
    const services = createServices()
    render(<App services={services} />)

    const locationButton = await screen.findByRole('button', { name: /Казань/ })
    expect(services.cities.load).not.toHaveBeenCalled()

    await user.click(locationButton)

    expect(services.cities.load).toHaveBeenCalledTimes(1)
  })

  it('показывает короткий статус во время загрузки городов', async () => {
    const user = userEvent.setup()
    let resolveCities!: (value: CityCatalog) => void
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

    expect(screen.getByText('Загружаем города')).toBeVisible()

    resolveCities!({
      source: cityDataset.source,
      countryGroups: getCountryGroups(cityDataset),
    })
    expect(await screen.findByText('Турция', { exact: true })).toBeVisible()
  })

  it('не сбрасывает поиск при секундном обновлении таймера', async () => {
    const user = userEvent.setup()
    render(<App services={createServices()} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    await user.click(screen.getByRole('button', { name: 'Найти город или район' }))
    await user.type(screen.getByRole('searchbox'), 'челны')
    expect(screen.getByRole('button', { name: 'Набережные Челны' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Казань' })).not.toBeInTheDocument()

    await new Promise((resolve) => setTimeout(resolve, 1_100))

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
    expect(services.getPosition).toHaveBeenCalledTimes(1)
    expect(services.getPosition).toHaveBeenCalledWith('coarse')
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
        .mockResolvedValueOnce(coarse)
        .mockResolvedValueOnce(precise),
    })
    render(<App services={services} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    await user.click(screen.getByRole('button', { name: 'Определить автоматически' }))

    expect(await screen.findByRole('button', { name: /Moscow, Россия/i })).toBeVisible()
    const schedule = screen.getByRole('list', { name: 'Времена намаза' })
    expect(within(schedule).getAllByRole('listitem')).toHaveLength(7)
    expect(within(schedule).getByText('Фаджр')).toBeVisible()
    expect(within(schedule).queryByText(/сухура/i)).not.toBeInTheDocument()
    expect(within(schedule).queryByText(/в мечетях/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Расчёт по настройкам · ДУМ РТ/i)).toBeVisible()
    expect(services.getPosition).toHaveBeenNthCalledWith(1, 'coarse')
    expect(services.getPosition).toHaveBeenNthCalledWith(2, 'precise')
    expect(services.saveCalculatedLocation).toHaveBeenCalledWith({
      ...precise,
      name: 'Moscow, Россия',
      cityId: 524901,
      nameSource: 'geonames',
      source: 'gps',
    })
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
        .mockResolvedValueOnce(coarse)
        .mockRejectedValueOnce(new Error('timeout')),
    })
    render(<App services={services} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    await user.click(screen.getByRole('button', { name: 'Определить автоматически' }))

    expect(await screen.findByText('Фаджр')).toBeVisible()
    expect(services.saveCalculatedLocation).toHaveBeenCalledWith({
      ...coarse,
      name: 'Moscow, Россия',
      cityId: 524901,
      nameSource: 'geonames',
      source: 'gps',
    })
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
    const baseServices = createServices()
    const services = createServices({
      cities: {
        ...baseServices.cities,
        load: vi.fn().mockRejectedValue(new Error('offline')),
      },
      getPosition: vi.fn()
        .mockResolvedValueOnce(coarse)
        .mockResolvedValueOnce(precise),
    })
    render(<App services={services} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    expect(await screen.findByText('Города сейчас недоступны')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Определить автоматически' }))

    expect(await screen.findByRole('button', { name: /Текущее местоположение/ })).toBeVisible()
    expect(screen.getByRole('list', { name: 'Времена намаза' }).children).toHaveLength(7)
    expect(services.saveCalculatedLocation).toHaveBeenCalledWith({
      ...precise,
      source: 'gps',
    })
  })

  it('ищет и выбирает город из офлайн-справочника', async () => {
    const user = userEvent.setup()
    const services = createServices()
    render(<App services={services} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    await user.click(screen.getByRole('button', { name: 'Найти город или район' }))
    await user.type(screen.getByRole('searchbox'), 'Стамбул')
    expect(screen.getByText('Турция', { exact: true })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Istanbul, Турция' }))

    expect(await screen.findByRole('button', { name: /Istanbul, Турция/ })).toBeVisible()
    expect(services.saveCalculatedLocation).toHaveBeenCalledWith({
      latitude: 41.0138,
      longitude: 28.9497,
      accuracy: null,
      timestamp: 1_788_256_800_000,
      name: 'Istanbul, Турция',
      cityId: 745044,
      nameSource: 'geonames',
      source: 'preset',
    })
  })

  it('показывает статус поиска и сохраняет группировку по странам', async () => {
    const user = userEvent.setup()
    let resolveSearch!: (cities: CityDataset['cities']) => void
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
    await screen.findByText('Турция', { exact: true })
    await user.click(screen.getByRole('button', { name: 'Найти город или район' }))
    await user.type(screen.getByRole('searchbox'), 'Москва')

    expect(await screen.findByText('Ищем города…', { selector: '.city-search-state p' })).toBeVisible()
    resolveSearch!([cityDataset.cities[1]!])

    expect(await screen.findByText('Россия', { exact: true })).toBeVisible()
    expect(screen.getByText('Найдено вариантов: 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Moscow, Россия' })).toBeVisible()
  })

  it('показывает крупнейшие города подпунктами страны', async () => {
    const user = userEvent.setup()
    render(<App services={createServices()} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    const dialog = screen.getByRole('dialog', { name: 'Выбор местоположения' })
    await user.click(within(dialog).getByText('Турция', { exact: true }))

    expect(within(dialog).getByRole('button', { name: 'Istanbul, Турция' })).toBeVisible()
  })

  it('отправляет округлённую геопозицию во внешний сервис только по кнопке и кеширует название', async () => {
    const user = userEvent.setup()
    const calculatedLocation = {
      latitude: 55.7558,
      longitude: 37.6173,
      accuracy: 12,
      timestamp: 200,
      name: 'Moscow, Россия',
      cityId: 524901,
      nameSource: 'geonames' as const,
      source: 'gps' as const,
    }
    const baseServices = createServices()
    const services = createServices({
      initialize: vi.fn().mockResolvedValue({
        ...(await baseServices.initialize()),
        locationMode: 'calculated',
        calculatedLocation,
      }),
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
    })
    expect(screen.getByText('Москва, Россия')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Название уточнено онлайн' })).toBeDisabled()
  })

  it('сохраняет Аср, профиль и северное правило независимо', async () => {
    const user = userEvent.setup()
    const services = createServices()
    render(<App services={services} />)

    await user.click(await screen.findByRole('button', { name: 'Настройки автономного расчёта' }))
    const dialog = screen.getByRole('dialog', { name: 'Настройки расчёта' })
    expect(within(dialog).getByText(/Сейчас используется готовое расписание ДУМ РТ/i)).toBeVisible()
    await user.selectOptions(within(dialog).getByLabelText('Аср'), 'standard')
    await user.selectOptions(within(dialog).getByLabelText('Профиль'), 'turkey')
    await user.selectOptions(within(dialog).getByLabelText('Северные правила'), 'seventhOfNight')

    expect(services.saveCalculationSettings).toHaveBeenLastCalledWith({
      asrMethod: 'standard',
      profile: 'turkey',
      highLatitudeRule: 'seventhOfNight',
    })
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
      initialize: vi.fn().mockRejectedValue(new Error('offline')),
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
      if (shouldFail) return Promise.reject(new Error('offline'))
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
