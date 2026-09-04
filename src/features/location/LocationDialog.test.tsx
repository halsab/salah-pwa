import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CityCatalog } from '../../data/cityCatalog'
import type { City } from '../../domain/cities'
import type { DataFailure } from '../../domain/errors'
import { failure, success, type Result } from '../../domain/result'
import { LocationDialog } from './LocationDialog'

const istanbul: City = {
  id: 745044,
  name: 'Стамбул',
  countryCode: 'TR',
  admin1Code: '34',
  latitude: 41.0138,
  longitude: 28.9497,
  population: 15_701_602,
  timeZone: 'Europe/Istanbul',
}

const moscow: City = {
  id: 524901,
  name: 'Москва',
  countryCode: 'RU',
  admin1Code: '48',
  latitude: 55.7522,
  longitude: 37.6156,
  population: 10_381_222,
  timeZone: 'Europe/Moscow',
}

const catalog: CityCatalog = {
  source: {
    name: 'GeoNames',
    url: 'https://www.geonames.org/',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    updatedAt: '2026-08-31',
  },
  countryGroups: [{
    code: 'TR',
    name: 'Турция',
    cities: [istanbul],
    totalCount: 12,
  }],
}

function deferred<Value>() {
  let resolve!: (value: Value) => void
  const promise = new Promise<Value>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

function renderDialog(overrides: Partial<ComponentProps<typeof LocationDialog>> = {}) {
  const props: ComponentProps<typeof LocationDialog> = {
    locations: [{ id: 'kazan', name: 'Казань', latitude: 55.7946, longitude: 49.1115 }],
    cityCatalog: null,
    cityCatalogStatus: 'idle',
    selectedOfficialId: 'kazan',
    selectedCityId: null,
    calculatedLocation: null,
    open: true,
    onClose: vi.fn(),
    onSelectOfficial: vi.fn(),
    onSelectCity: vi.fn(),
    onLocate: vi.fn().mockResolvedValue(undefined),
    onReverse: vi.fn().mockResolvedValue(undefined),
    onLoadCities: vi.fn(),
    onSearchCities: vi.fn().mockResolvedValue(success([])),
    ...overrides,
  }
  return { props, ...render(<LocationDialog {...props} />) }
}

afterEach(() => vi.useRealTimers())

describe('LocationDialog', () => {
  it('в idle не показывает состояние каталога и загружает его только при входе в поиск', () => {
    const { props } = renderDialog()

    expect(screen.queryByText('Загружаем города')).not.toBeInTheDocument()
    expect(screen.queryByText('Города сейчас недоступны')).not.toBeInTheDocument()
    expect(props.onLoadCities).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Найти город или район' }))

    expect(props.onLoadCities).toHaveBeenCalledTimes(1)
  })

  it('ждёт 200 мс, не запускает быстрые промежуточные запросы и игнорирует устаревший ответ', async () => {
    vi.useFakeTimers()
    const older = deferred<Result<City[], DataFailure>>()
    const latest = deferred<Result<City[], DataFailure>>()
    const onSearchCities = vi.fn()
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(latest.promise)
    renderDialog({
      cityCatalog: catalog,
      cityCatalogStatus: 'ready',
      onSearchCities,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Найти город или район' }))
    const searchbox = screen.getByRole('searchbox')

    fireEvent.change(searchbox, { target: { value: 'мо' } })
    act(() => vi.advanceTimersByTime(199))
    expect(onSearchCities).not.toHaveBeenCalled()
    fireEvent.change(searchbox, { target: { value: 'москва' } })
    act(() => vi.advanceTimersByTime(200))
    expect(onSearchCities).toHaveBeenCalledTimes(1)
    expect(onSearchCities).toHaveBeenLastCalledWith('москва')

    fireEvent.change(searchbox, { target: { value: 'стамбул' } })
    act(() => vi.advanceTimersByTime(200))
    expect(onSearchCities).toHaveBeenCalledTimes(2)
    await act(async () => latest.resolve(success([istanbul])))
    expect(screen.getByRole('button', { name: 'Стамбул, Турция' })).toBeVisible()

    await act(async () => older.resolve(success([moscow])))
    expect(screen.queryByRole('button', { name: 'Москва, Россия' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Стамбул, Турция' })).toBeVisible()
  })

  it('показывает офлайн-сообщение только после неудавшейся попытки и честный размер обзора', () => {
    const { rerender, props } = renderDialog()

    expect(screen.queryByText('Нет сети, а каталог городов ещё не сохранён')).not.toBeInTheDocument()
    rerender(<LocationDialog {...props} cityCatalogStatus="offline" />)
    expect(screen.getByText('Нет сети, а каталог городов ещё не сохранён')).toBeVisible()

    rerender(
      <LocationDialog
        {...props}
        cityCatalog={catalog}
        cityCatalogStatus="ready"
      />,
    )
    expect(screen.getByText('Крупные города · 1 из 12')).toBeVisible()
  })

  it.each(['offline', 'unavailable', 'invalid'] as const)(
    'обрабатывает typed %s failure поиска без применения результатов',
    async (reason) => {
      const onSearchCities = vi.fn().mockResolvedValue(failure({
        kind: 'data',
        reason,
      }))
      renderDialog({
        cityCatalog: catalog,
        cityCatalogStatus: 'ready',
        onSearchCities,
      })

      fireEvent.click(screen.getByRole('button', { name: 'Найти город или район' }))
      fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Стамбул' } })

      expect(await screen.findByText(
        'Не удалось выполнить поиск городов.',
        { selector: '.empty-search' },
      )).toBeVisible()
      expect(screen.queryByRole('button', { name: 'Стамбул, Турция' })).not.toBeInTheDocument()
    },
  )
})
