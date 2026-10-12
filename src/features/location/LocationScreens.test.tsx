import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { failure, success } from '../../domain/result'
import { createCityPlace, createGpsPlace, createOfficialPlace, setPlaceTimeZone, withNearbyCity } from '../../domain/place'
import { isValidTimeZone } from '../../domain/locationTime'
import type { CitySearchResult } from '../../data/cityCatalog'
import { LocationScreen, SearchScreen } from './LocationScreens'
const location = { id: 'kazan', name: 'Казань', latitude: 55.79, longitude: 49.11 }
const city = { id: 1, name: 'Москва', countryCode: 'RU', admin1Code: '48', admin1Name: 'Москва', latitude: 55.75, longitude: 37.61, population: 100, timeZone: 'Europe/Moscow' }
const searchProps = { locations: [location], catalogStatus: 'ready' as const, onLoadCities: vi.fn(), onBack: vi.fn(), onSelectOfficial: vi.fn(), onSelectCity: vi.fn(), onSearchCities: vi.fn().mockResolvedValue(success({ cities: [city], status: 'complete', missingPackages: [] })) }
describe('экраны локации', () => {
  it('объясняет запрос разрешения на первом запуске без запуска GPS', () => {
    const onLocate = vi.fn()
    render(<LocationScreen initial place={null} recentPlaces={[]} onSelectRecent={vi.fn()} onBack={vi.fn()} onSearch={vi.fn()} onLocate={onLocate} />)
    expect(screen.getByText('Браузер запросит доступ к геопозиции. При необходимости город можно выбрать вручную.')).toBeVisible()
    expect(onLocate).not.toHaveBeenCalled()
  })
  it('показывает координаты и точность GPS в компактном формате', () => {
    const gps = createGpsPlace({ latitude: 55.79631, longitude: 49.10881, accuracy: 120, timestamp: 0 }, 'Europe/Moscow', null, 'gps:1')
    const { rerender } = render(<LocationScreen place={gps} recentPlaces={[]} onSelectRecent={vi.fn()} onBack={vi.fn()} onSearch={vi.fn()} onLocate={vi.fn()} />)
    expect(screen.getByText('55.7963, 49.1088')).toBeVisible()
    expect(screen.getByText('Точность ±120 м')).toBeVisible()
    rerender(<LocationScreen place={{ ...gps, accuracy: 2400 }} recentPlaces={[]} onSelectRecent={vi.fn()} onBack={vi.fn()} onSearch={vi.fn()} onLocate={vi.fn()} />)
    expect(screen.getByText('Точность ±2,4 км')).toBeVisible()
    rerender(<LocationScreen place={{ ...gps, accuracy: null }} recentPlaces={[]} onSelectRecent={vi.fn()} onBack={vi.fn()} onSearch={vi.fn()} onLocate={vi.fn()} />)
    expect(screen.getByText('Точность неизвестна')).toBeVisible()
  })
  it('показывает, что timezone GPS вне подтверждённой географии взята с устройства', () => {
    const gps = createGpsPlace({ latitude: 48.85, longitude: 2.35, accuracy: 80, timestamp: 0 }, 'America/Los_Angeles', null, 'gps:paris')
    render(<LocationScreen place={gps} recentPlaces={[]} currentTime={new Date('2026-07-01T12:00:00Z')} onSelectRecent={vi.fn()} onBack={vi.fn()} onSearch={vi.fn()} onLocate={vi.fn()} />)
    expect(screen.getByText('America/Los_Angeles')).toBeVisible()
    expect(screen.getByText('Источник: часовой пояс устройства')).toBeVisible()
    expect(screen.getByText('Для этих координат часовой пояс географически не подтверждён.')).toBeVisible()
    expect(screen.getByText('(UTC−7)')).toBeVisible()
  })
  it('выбирает IANA-зону для GPS и предоставляет явный возврат к автоматической', async () => {
    const gps = createGpsPlace({ latitude: 48.85, longitude: 2.35, accuracy: 80, timestamp: 0 }, 'UTC', null, 'gps:paris')
    const onChangeTimeZone = vi.fn().mockResolvedValue('Europe/Berlin')
    const props = { place: gps, recentPlaces: [], currentTime: new Date('2026-01-01T12:00:00Z'), onChangeTimeZone,
      onSelectRecent: vi.fn(), onBack: vi.fn(), onSearch: vi.fn(), onLocate: vi.fn() }
    const { rerender } = render(<LocationScreen {...props} />)
    await userEvent.click(screen.getByRole('button', { name: 'Изменить часовой пояс' }))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Поиск часового пояса IANA' }), 'Europe/Berlin')
    await userEvent.click(await screen.findByRole('button', { name: /Europe\/Berlin/ }))
    expect(onChangeTimeZone).toHaveBeenLastCalledWith('Europe/Berlin')
    const overridden = setPlaceTimeZone(gps, 'Europe/Berlin')
    rerender(<LocationScreen {...props} place={overridden} />)
    expect(screen.getByText('Источник: выбрано вручную')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Восстановить автоматический' }))
    expect(onChangeTimeZone).toHaveBeenLastCalledWith(null)
  })
  it('при отсутствии Intl.supportedValuesOf принимает только проверенный IANA id без сети', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(Intl, 'supportedValuesOf')
    Object.defineProperty(Intl, 'supportedValuesOf', { configurable: true, value: undefined })
    try {
      const gps = createGpsPlace({ latitude: 48.85, longitude: 2.35, accuracy: 80, timestamp: 0 }, 'UTC', null, 'gps:paris')
      const onChangeTimeZone = vi.fn().mockResolvedValue('Europe/Berlin')
      render(<LocationScreen place={gps} recentPlaces={[]} onChangeTimeZone={onChangeTimeZone} onSelectRecent={vi.fn()} onBack={vi.fn()} onSearch={vi.fn()} onLocate={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: 'Изменить часовой пояс' }))
      const input = screen.getByRole('searchbox', { name: 'Поиск часового пояса IANA' })
      await userEvent.type(input, '+03:00')
      await userEvent.click(screen.getByRole('button', { name: 'Применить часовой пояс' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('Введите поддерживаемый идентификатор часового пояса IANA')
      expect(onChangeTimeZone).not.toHaveBeenCalled()
      await userEvent.clear(input)
      await userEvent.type(input, 'Europe/Berlin')
      expect(input).toHaveValue('Europe/Berlin')
      expect(isValidTimeZone('Europe/Berlin')).toBe(true)
      await userEvent.click(screen.getByRole('button', { name: 'Применить часовой пояс' }))
      expect(onChangeTimeZone).toHaveBeenCalledWith('Europe/Berlin')
    } finally {
      if (descriptor) Object.defineProperty(Intl, 'supportedValuesOf', descriptor)
      else Reflect.deleteProperty(Intl, 'supportedValuesOf')
    }
  })
  it('для официального пункта ДУМ РТ не предлагает новую зону и сохраняет только сброс прежнего override', async () => {
    const official = createOfficialPlace(location, 0)
    const onChangeTimeZone = vi.fn().mockResolvedValue('Europe/Moscow')
    const props = { place: official, recentPlaces: [], onChangeTimeZone, onSelectRecent: vi.fn(), onBack: vi.fn(), onSearch: vi.fn(), onLocate: vi.fn() }
    const { rerender } = render(<LocationScreen {...props} />)
    expect(screen.getByText('Источник: официальный пункт ДУМ РТ')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Изменить часовой пояс' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Восстановить автоматический' })).not.toBeInTheDocument()
    rerender(<LocationScreen {...props} place={setPlaceTimeZone(official, 'Europe/Berlin')} />)
    expect(screen.getByText('Опубликованное расписание ДУМ РТ остаётся в Europe/Moscow.')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Восстановить автоматический' }))
    expect(onChangeTimeZone).toHaveBeenLastCalledWith(null)
  })
  it('показывает происхождение часового пояса каталога и legacy Place', () => {
    const catalogPlace = createCityPlace(city, 0)
    const { rerender } = render(<LocationScreen place={catalogPlace} recentPlaces={[]} onChangeTimeZone={vi.fn()} onSelectRecent={vi.fn()} onBack={vi.fn()} onSearch={vi.fn()} onLocate={vi.fn()} />)
    expect(screen.getByText('Источник: каталог выбранного города')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Изменить часовой пояс' })).not.toBeInTheDocument()
    rerender(<LocationScreen place={{ ...catalogPlace, automaticTimeZone: { id: catalogPlace.timeZone, source: 'legacy' } }} recentPlaces={[]}
      onChangeTimeZone={vi.fn()} onSelectRecent={vi.fn()} onBack={vi.fn()} onSearch={vi.fn()} onLocate={vi.fn()} />)
    expect(screen.getByText('Источник автоматической зоны неизвестен')).toBeVisible()
  })
  it('не открывает новый override для GPS-точки внутри подтверждённого Татарстана', () => {
    const gps = { ...createGpsPlace({ latitude: 55.79, longitude: 49.12, accuracy: 20, timestamp: 0 }, 'UTC', null, 'gps:inside'),
      coverage: 'inside' as const, region: { code: 'RU-TA', name: 'Татарстан' },
      timeZone: 'Europe/Moscow', automaticTimeZone: { id: 'Europe/Moscow', source: 'boundary' as const } }
    render(<LocationScreen place={gps} recentPlaces={[]} onChangeTimeZone={vi.fn()} onSelectRecent={vi.fn()} onBack={vi.fn()} onSearch={vi.fn()} onLocate={vi.fn()} />)
    expect(screen.getByText('Источник: подтверждённая геозона Татарстана')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Изменить часовой пояс' })).not.toBeInTheDocument()
  })
  it('отмечает полное название GPS как ближайший населённый пункт', () => {
    const gps = withNearbyCity(createGpsPlace({ latitude: 55.79631, longitude: 49.10881, accuracy: 120, timestamp: 0 }, 'Europe/Moscow', null, 'gps:1'), { ...city, name: 'Казань', admin1Code: '73', admin1Name: 'Татарстан', latitude: 55.79, longitude: 49.12 })
    render(<LocationScreen place={gps} recentPlaces={[]} onSelectRecent={vi.fn()} onBack={vi.fn()} onSearch={vi.fn()} onLocate={vi.fn()} />)
    expect(screen.getByText('Ближайший населённый пункт: Казань, Татарстан, РФ')).toBeVisible()
  })
  it.each([
    [{ status: 'locating' as const }, 'Определяем местоположение…'],
    [{ status: 'refining' as const }, 'Местоположение найдено. Уточняем…'],
    [{ status: 'ready' as const, lowAccuracy: true }, 'Местоположение определено с низкой точностью'],
  ])('показывает релевантный GPS status %#', (gpsState, message) => {
    const gps = createGpsPlace({ latitude: 55.79, longitude: 49.12, accuracy: 1200, timestamp: 0 }, 'Europe/Moscow', null, 'gps:1')
    render(<LocationScreen place={gps} recentPlaces={[]} gpsState={gpsState} onAcceptGps={vi.fn()} onSelectRecent={vi.fn()} onBack={vi.fn()} onSearch={vi.fn()} onLocate={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent(message)
  })
  it('позволяет принять provisional point и повторить low-accuracy поиск', async () => {
    const onAcceptGps = vi.fn()
    const onLocate = vi.fn()
    const gps = createGpsPlace({ latitude: 55.79, longitude: 49.12, accuracy: 1200, timestamp: 0 }, 'Europe/Moscow', null, 'gps:1')
    render(<LocationScreen place={gps} recentPlaces={[]} gpsState={{ status: 'ready', lowAccuracy: true }} onAcceptGps={onAcceptGps} onSelectRecent={vi.fn()} onBack={vi.fn()} onSearch={vi.fn()} onLocate={onLocate} />)
    await userEvent.click(screen.getByRole('button', { name: 'Использовать эту точку' }))
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(onAcceptGps).toHaveBeenCalledOnce()
    expect(onLocate).toHaveBeenCalledOnce()
  })
  it.each([
    ['offline', 'Нет интернета. Используем координаты.'],
    ['failed', 'Название места определить не удалось. Используем координаты.'],
    ['not-found', 'Ближайший населённый пункт не найден. Используем координаты.'],
  ] as const)('отделяет результат name lookup %s от GPS', (nameLookupState, message) => {
    const gps = createGpsPlace({ latitude: 55.79, longitude: 49.12, accuracy: 120, timestamp: 0 }, 'Europe/Moscow', null, 'gps:1')
    render(<LocationScreen place={gps} recentPlaces={[]} nameLookupState={nameLookupState} onSelectRecent={vi.fn()} onBack={vi.fn()} onSearch={vi.fn()} onLocate={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent(message)
  })
  it.each([
    ['denied', 'Доступ к геопозиции запрещён. Разрешите доступ в настройках браузера или выберите город вручную.'],
    ['unsupported', 'Этот браузер не поддерживает геопозицию. Выберите город вручную.'],
    ['timeout', 'Не удалось определить местоположение вовремя. Попробуйте ещё раз или выберите город вручную.'],
    ['unavailable', 'Устройство не смогло определить геопозицию. Проверьте службы геолокации и попробуйте снова.'],
  ] as const)('показывает конкретную GPS error %s и сохраняет ручной поиск', (reason, message) => {
    render(<LocationScreen place={null} recentPlaces={[]} gpsState={{ status: 'error', reason }} onSelectRecent={vi.fn()} onBack={vi.fn()} onSearch={vi.fn()} onLocate={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('button', { name: 'Найти город' })).toBeEnabled()
  })
  it('сокращает страну в поиске, сохраняя полное доступное название', async () => {
    render(<SearchScreen {...searchProps} />)
    await userEvent.type(screen.getByRole('searchbox'), 'Москва')
    const result = await screen.findByRole('button', { name: 'Москва, Москва, Россия' })
    expect(result).toHaveTextContent('Москва, РФ')
  })
  it('сокращает старые подписи текущего и недавнего места без изменения данных', () => {
    const place = createCityPlace(city, 0)
    const recent = createCityPlace({ ...city, id: 2, name: 'Киров', admin1Name: 'Кировская область' }, 0)
    render(<LocationScreen place={place} recentPlaces={[recent]} onSelectRecent={vi.fn()} onBack={vi.fn()} onSearch={vi.fn()} onLocate={vi.fn()} />)
    expect(screen.getByText('Москва, Москва, РФ')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Киров, Кировская область, РФ' })).toBeVisible()
    expect(place.name).toBe('Москва, Москва, Россия')
  })
  it('не теряет результаты при пробеле после уже найденного названия', async () => {
    const onSearchCities = vi.fn().mockResolvedValue(success({ cities: [city], status: 'complete', missingPackages: [] }))
    render(<SearchScreen {...searchProps} onSearchCities={onSearchCities} />)
    await userEvent.type(screen.getByRole('searchbox'), 'Москва')
    await screen.findByRole('button', { name: /Москва/ })
    await userEvent.type(screen.getByRole('searchbox'), ' ')
    expect(screen.getByRole('button', { name: /Москва/ })).toBeVisible()
    expect(onSearchCities).toHaveBeenCalledTimes(1)
  })
  it('выбирает недавний город одним тапом без подтверждения', async () => {
    const onSelectRecent = vi.fn()
    render(<LocationScreen place={createOfficialPlace(location, 0)} recentPlaces={[createOfficialPlace({ ...location, id: 'ufa', name: 'Уфа' }, 0)]} onSelectRecent={onSelectRecent} onBack={vi.fn()} onSearch={vi.fn()} onLocate={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Уфа' }))
    expect(onSelectRecent).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Выбрать' })).not.toBeInTheDocument()
  })
  it('выбирает результат поиска одним тапом', async () => {
    const onSelectCity = vi.fn()
    render(<SearchScreen {...searchProps} onSelectCity={onSelectCity} />)
    await userEvent.type(screen.getByRole('searchbox'), 'Моск')
    await userEvent.click(await screen.findByRole('button', { name: /Москва/ }))
    expect(onSelectCity).toHaveBeenCalledWith(city)
    expect(screen.queryByRole('button', { name: 'По геопозиции' })).not.toBeInTheDocument()
  })
  it('не показывает запоздалый ответ предыдущего запроса', async () => {
    let resolve!: (value: ReturnType<typeof success<CitySearchResult>>) => void
    const onSearchCities = vi.fn().mockImplementationOnce(() => new Promise(r => { resolve = r })).mockResolvedValue(success({ cities: [], status: 'complete', missingPackages: [] }))
    render(<SearchScreen {...searchProps} onSearchCities={onSearchCities} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Моск' } })
    await waitFor(() => expect(onSearchCities).toHaveBeenCalledWith('Моск'))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Лондон' } })
    await act(async () => { resolve(success({ cities: [city], status: 'complete', missingPackages: [] })); await Promise.resolve() })
    expect(screen.queryByRole('button', { name: /Москва/ })).not.toBeInTheDocument()
    expect(await screen.findByText('Город не найден')).toBeVisible()
  })
  it('сохраняет доступ к опубликованным пунктам при офлайн-каталоге', async () => {
    render(<SearchScreen {...searchProps} catalogStatus="offline" />)
    await userEvent.type(screen.getByRole('searchbox'), 'Каз')
    expect(screen.getByRole('button', { name: /Казань.*ДУМ РТ/ })).toBeEnabled()
    expect(screen.getByText('Для поиска городов нужен интернет')).toBeVisible()
  })
  it.each(['offline', 'unavailable', 'invalid'] as const)('обрабатывает ошибку %s и повторяет поиск', async reason => {
    const search = vi.fn().mockResolvedValueOnce(failure({ kind: 'data', reason })).mockResolvedValue(success({ cities: [city], status: 'complete', missingPackages: [] }))
    render(<SearchScreen {...searchProps} onSearchCities={search} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Москва' } })
    expect(await screen.findByText('Не удалось выполнить поиск')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByRole('button', { name: /Москва/ })).toBeVisible()
  })
  it('обрабатывает отклонение promise', async () => {
    render(<SearchScreen {...searchProps} onSearchCities={vi.fn().mockRejectedValue(new Error('unavailable'))} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Москва' } })
    expect(await screen.findByText('Не удалось выполнить поиск')).toBeVisible()
  })
  it('различает одинаковые города и повторяет неполный поиск', async () => {
    const cities = [1, 2].map(id => ({ ...city, id, name: 'Киров', admin1Name: 'Кировская область' }))
    const search = vi.fn().mockResolvedValueOnce(success({ cities, status: 'needs-download', missingPackages: ['RU-1'] })).mockResolvedValue(success({ cities, status: 'complete', missingPackages: [] }))
    render(<SearchScreen {...searchProps} onSearchCities={search} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Киров' } })
    expect(await screen.findByText('Для полного поиска нужен интернет')).toBeVisible()
    expect(screen.getByRole('button', { name: /Киров.*GeoNames 1/ })).toHaveTextContent('Кировская область')
    expect(screen.getByRole('button', { name: /Киров.*GeoNames 2/ })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    await waitFor(() => expect(search).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText('Для полного поиска нужен интернет')).not.toBeInTheDocument())
  })
  it('оформляет триггер поиска как field-like, а гео-действие полноширинным', () => {
    render(<LocationScreen initial place={null} recentPlaces={[]} onSelectRecent={vi.fn()} onBack={vi.fn()} onSearch={vi.fn()} onLocate={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Найти город' })).toHaveClass('pill--field')
    expect(screen.getByRole('button', { name: 'По геопозиции' })).toHaveClass('pill--primary')
  })
  it('выравнивает результаты поиска как двухстрочные строки слева', async () => {
    render(<SearchScreen {...searchProps} />)
    await userEvent.type(screen.getByRole('searchbox'), 'Москва')
    const result = await screen.findByRole('button', { name: 'Москва, Москва, Россия' })
    expect(result).toHaveClass('pill-row', 'pill-row--stacked')
  })

})
