import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { failure, success } from '../../domain/result'
import { createCityPlace, createGpsPlace, createOfficialPlace } from '../../domain/place'
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

})
