import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createOfficialPlace } from '../../domain/place'
import type { ResolvedPrayerSource } from '../../domain/prayerSource'
import type { PrayerDay } from '../../domain/types'
import { useDaylightWindow } from './useDaylightWindow'

const day: PrayerDay = {
  locationId: 'kazan', date: '2026-09-01', fajrStart: '02:21', fajrJamaat: '03:17',
  sunrise: '04:48', zenith: '11:44', dhuhr: '12:00', asr: '16:24', maghrib: '18:39', isha: '20:33',
}
const place = createOfficialPlace({ id: 'kazan', name: 'Казань', latitude: 55.79, longitude: 49.11 }, 0)
const resolution: ResolvedPrayerSource = {
  kind: 'official', status: 'ready', provider: 'dumRt', version: '1', revision: 'revision',
  coverage: 'RU-TA', locationId: 'kazan', timeZone: 'Europe/Moscow',
}

describe('useDaylightWindow', () => {
  it('loads only the current civil day and keeps the request stable across renders', async () => {
    const getDays = vi.fn().mockResolvedValue([day])
    const services = { getDays }
    const { result, rerender } = renderHook(({ date }) => useDaylightWindow({ services, location: place, resolution, date }), {
      initialProps: { date: day.date },
    })
    await waitFor(() => expect(result.current).not.toBeNull())
    expect(getDays).toHaveBeenCalledWith('kazan', [day.date], 'revision')
    rerender({ date: day.date })
    await act(() => Promise.resolve())
    expect(getDays).toHaveBeenCalledTimes(1)
  })

  it('uses a dark fallback while today is unavailable', async () => {
    const services = { getDays: vi.fn().mockResolvedValue([undefined]) }
    const { result } = renderHook(() => useDaylightWindow({ services, location: place, resolution, date: day.date }))
    await waitFor(() => expect(services.getDays).toHaveBeenCalled())
    expect(result.current).toBeNull()
  })
})
