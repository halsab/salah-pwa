import { afterEach, describe, expect, it, vi } from 'vitest'

import { getCurrentPosition } from './browser'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('getCurrentPosition', () => {
  it('быстро получает допустимые кешированные координаты', async () => {
    const getPosition = vi.fn((success: PositionCallback, _error?: PositionErrorCallback, _options?: PositionOptions) =>
      success({
        coords: { latitude: 55.8, longitude: 49.1, accuracy: 750 },
        timestamp: 123,
      } as GeolocationPosition),
    )
    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition: getPosition },
    })

    await expect(getCurrentPosition('coarse')).resolves.toEqual({
      latitude: 55.8,
      longitude: 49.1,
      accuracy: 750,
      timestamp: 123,
    })
    expect(getPosition.mock.calls[0]?.[2]).toEqual({
      enableHighAccuracy: false,
      timeout: 10_000,
      maximumAge: 600_000,
    })
  })

  it('запрашивает свежие точные координаты вне зоны официального расписания', async () => {
    const getPosition = vi.fn((success: PositionCallback, _error?: PositionErrorCallback, _options?: PositionOptions) =>
      success({
        coords: { latitude: 55.75, longitude: 37.62, accuracy: 12 },
        timestamp: 456,
      } as GeolocationPosition),
    )
    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition: getPosition },
    })

    await getCurrentPosition('precise')

    expect(getPosition.mock.calls[0]?.[2]).toEqual({
      enableHighAccuracy: true,
      timeout: 30_000,
      maximumAge: 0,
    })
  })
})
