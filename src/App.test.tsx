import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { App, type AppServices } from './App'
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
    }),
    getDay: vi
      .fn()
      .mockImplementation((locationId: string, date: string) =>
        Promise.resolve(
          days.find((day) => day.locationId === locationId && day.date === date),
        ),
      ),
    saveLocation: vi.fn().mockResolvedValue(undefined),
    getPermission: vi.fn().mockResolvedValue('prompt'),
    getPosition: vi.fn().mockResolvedValue({ latitude: 55.742, longitude: 52.3992 }),
    now: () => new Date('2026-09-01T10:00:00.000Z'),
    ...overrides,
  }
}

describe('Salah', () => {
  it('показывает все восемь времён и обратный отсчёт до следующего намаза', async () => {
    render(<App services={createServices()} />)

    expect(await screen.findByRole('button', { name: /Казань/ })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Salah' })).toBeVisible()
    expect(await screen.findByText('До следующего намаза')).toBeVisible()
    expect(screen.getByText('Аср · 16:24')).toBeVisible()
    expect(screen.getByText('03:24:00')).toBeVisible()

    const schedule = screen.getByRole('list', { name: 'Времена намаза' })
    expect(within(schedule).getAllByRole('listitem')).toHaveLength(8)
    expect(within(schedule).getByText('Завершение сухура')).toBeVisible()
    expect(within(schedule).getByText(/в мечетях/i)).toBeVisible()
    expect(within(schedule).getByText('20:33')).toBeVisible()
  })

  it('при просмотре другой даты скрывает таймер и показывает кнопку Сегодня', async () => {
    const user = userEvent.setup()
    render(<App services={createServices()} />)

    await screen.findByText('Аср · 16:24')
    await user.click(screen.getByRole('button', { name: 'Следующий день' }))

    expect((await screen.findAllByText('среда, 2 сентября'))[0]).toBeVisible()
    expect(screen.queryByText('До следующего намаза')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Сегодня' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Сегодня' }))
    expect(await screen.findByText('вторник, 1 сентября')).toBeVisible()
  })

  it('меняет населённый пункт через доступный диалог', async () => {
    const user = userEvent.setup()
    const services = createServices()
    render(<App services={services} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    const dialog = screen.getByRole('dialog', { name: 'Выбор населённого пункта' })
    await user.type(within(dialog).getByRole('searchbox'), 'челны')
    await user.click(within(dialog).getByRole('button', { name: 'Набережные Челны' }))

    expect(await screen.findByRole('button', { name: /Набережные Челны/ })).toBeVisible()
    expect(screen.getByText('Аср · 16:37')).toBeVisible()
    expect(services.saveLocation).toHaveBeenCalledWith('naberezhnye-chelny')
  })

  it('не сбрасывает поиск при секундном обновлении таймера', async () => {
    const user = userEvent.setup()
    render(<App services={createServices()} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
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
    await waitFor(() => expect(screen.getByRole('searchbox')).toHaveFocus())

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(locationButton).toHaveFocus())
  })

  it('локально выбирает ближайший пункт по геолокации', async () => {
    const user = userEvent.setup()
    render(<App services={createServices()} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    await user.click(screen.getByRole('button', { name: 'Определить автоматически' }))

    expect(await screen.findByRole('button', { name: /Набережные Челны/ })).toBeVisible()
  })

  it('не подставляет далёкий город и оставляет ручной выбор', async () => {
    const user = userEvent.setup()
    const services = createServices({
      getPosition: vi.fn().mockResolvedValue({ latitude: 55.7558, longitude: 37.6173 }),
    })
    render(<App services={services} />)

    await user.click(await screen.findByRole('button', { name: /Казань/ }))
    await user.click(screen.getByRole('button', { name: 'Определить автоматически' }))

    expect(await screen.findByText(/Выберите населённый пункт вручную/i)).toBeVisible()
    expect(screen.getByRole('dialog', { name: 'Выбор населённого пункта' })).toBeVisible()
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
})
