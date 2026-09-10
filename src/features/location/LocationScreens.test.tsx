import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { success } from '../../domain/result'
import { createOfficialPlace } from '../../domain/place'
import type { CitySearchResult } from '../../data/cityCatalog'
import { LocationScreen, SearchScreen } from './LocationScreens'
const location = { id: 'kazan', name: 'Казань', latitude: 55.79, longitude: 49.11 }
const city = { id: 1, name: 'Москва', countryCode: 'RU', admin1Code: '48', admin1Name: 'Москва', latitude: 55.75, longitude: 37.61, population: 100, timeZone: 'Europe/Moscow' }
const searchProps = { locations: [location], catalogStatus: 'ready' as const, onLoadCities: vi.fn(), onBack: vi.fn(), onSelectOfficial: vi.fn(), onSelectCity: vi.fn(), onSearchCities: vi.fn().mockResolvedValue(success({ cities: [city], status: 'complete', missingPackages: [] })) }
describe('экраны локации', () => {
  it('выбирает недавний город одним тапом без подтверждения', async () => {
    const onSelectRecent = vi.fn()
    render(<LocationScreen place={createOfficialPlace(location, 0)} recentPlaces={[createOfficialPlace({ ...location, id: 'ufa', name: 'Уфа' }, 0)]} onSelectRecent={onSelectRecent} onBack={vi.fn()} onSearch={vi.fn()} onLocate={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Уфа' }))
    expect(onSelectRecent).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Выбрать' })).not.toBeInTheDocument()
  })
  it('оставляет выбор города доступным после отказа GPS', async () => {
    render(<LocationScreen place={null} recentPlaces={[]} onSelectRecent={vi.fn()} onBack={vi.fn()} onSearch={vi.fn()} onLocate={vi.fn().mockRejectedValue(new Error('Доступ к геопозиции запрещён'))} />)
    await userEvent.click(screen.getByRole('button', { name: 'По геопозиции' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Доступ к геопозиции запрещён')
    expect(screen.getByRole('button', { name: 'Найти город' })).toBeEnabled()
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
})
