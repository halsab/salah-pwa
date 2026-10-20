import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { failure, success } from '../../domain/result'
import type { CitySearchResult } from '../../data/cityCatalog'
import { LocationScreen, SearchScreen } from './LocationScreens'

const city = {
  id: 1,
  name: 'Moscow',
  countryCode: 'RU',
  admin1Code: '48',
  admin1Name: 'Moscow',
  latitude: 55.75,
  longitude: 37.61,
  population: 100,
  timeZone: 'Europe/Moscow',
}

const searchProps = {
  locations: [{ id: 'kazan', name: 'Kazan', latitude: 55.79, longitude: 49.11 }],
  catalogStatus: 'ready' as const,
  onLoadCities: vi.fn(),
  onBack: vi.fn(),
  onSelectOfficial: vi.fn(),
  onSelectCity: vi.fn(),
  onSearchCities: vi.fn().mockResolvedValue(success({ cities: [city], status: 'complete', missingPackages: [] })),
}

describe('location search behavior', () => {
  it('discards a stale result after the query changes', async () => {
    let resolveFirst!: (value: ReturnType<typeof success<CitySearchResult>>) => void
    const search = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve }))
      .mockResolvedValue(success({ cities: [], status: 'complete', missingPackages: [] }))
    render(<SearchScreen {...searchProps} onSearchCities={search} />)

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Mosc' } })
    await waitFor(() => expect(search).toHaveBeenCalled())
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'London' } })
    await screen.findByRole('status')

    await act(async () => {
      resolveFirst(success({ cities: [city], status: 'complete', missingPackages: [] }))
      await Promise.resolve()
    })

    expect(screen.queryByRole('button', { name: /Moscow/ })).not.toBeInTheDocument()
  })

  it('keeps published prayer locations selectable when the city catalog is offline', async () => {
    render(<SearchScreen {...searchProps} catalogStatus="offline" />)

    await userEvent.type(screen.getByRole('searchbox'), 'Kazan')

    expect(screen.getByRole('button', { name: /Kazan/ })).toBeEnabled()
  })

  it('recovers after a catalog search failure when the user retries', async () => {
    const search = vi.fn()
      .mockResolvedValueOnce(failure({ kind: 'data', reason: 'offline' }))
      .mockResolvedValue(success({ cities: [city], status: 'complete', missingPackages: [] }))
    render(<SearchScreen {...searchProps} onSearchCities={search} />)

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Moscow' } })
    await screen.findByRole('button', { name: /повторить/i })
    await userEvent.click(screen.getByRole('button', { name: /повторить/i }))

    expect(await screen.findByRole('button', { name: /Moscow/ })).toBeVisible()
  })

  it('keeps same-name cities distinct and offers a retry for incomplete results', async () => {
    const sameNameCities = [1, 2].map(id => ({ ...city, id, name: 'Kirov', admin1Name: 'Kirov Oblast' }))
    const search = vi.fn()
      .mockResolvedValueOnce(success({ cities: sameNameCities, status: 'needs-download', missingPackages: ['RU-1'] }))
      .mockResolvedValue(success({ cities: sameNameCities, status: 'complete', missingPackages: [] }))
    render(<SearchScreen {...searchProps} onSearchCities={search} />)

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Kirov' } })
    expect(await screen.findAllByRole('button', { name: /Kirov/ })).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: /повторить/i }))

    expect(await screen.findAllByRole('button', { name: /Kirov/ })).toHaveLength(2)
  })

  it('keeps manual city search available after location permission is denied', () => {
    render(<LocationScreen
      place={null}
      recentPlaces={[]}
      gpsState={{ status: 'error', reason: 'denied' }}
      onSelectRecent={vi.fn()}
      onBack={vi.fn()}
      onSearch={vi.fn()}
      onLocate={vi.fn()}
    />)

    expect(screen.getByRole('button', { name: /город/i })).toBeEnabled()
  })
})
