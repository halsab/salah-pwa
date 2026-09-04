import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useScheduleDate } from './useScheduleDate'

afterEach(() => {
  vi.useRealTimers()
})

describe('useScheduleDate', () => {
  it('обновляет корневое время только на границе минуты', () => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-09-01T10:00:00.000Z')
    const services = { now: () => new Date(Date.now()) }
    const { result, unmount } = renderHook(() =>
      useScheduleDate(services, 'Europe/Moscow'))
    const initialTime = result.current.currentTime

    act(() => vi.advanceTimersByTime(1_000))
    expect(result.current.currentTime).toBe(initialTime)

    act(() => vi.advanceTimersByTime(59_000))
    expect(result.current.currentTime.toISOString()).toBe(
      '2026-09-01T10:01:00.000Z',
    )

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('на минутной границе точно переводит следующую гражданскую дату', () => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-08-31T20:59:59.000Z')
    const services = { now: () => new Date(Date.now()) }
    const { result, unmount } = renderHook(() =>
      useScheduleDate(services, 'Europe/Moscow'))

    expect(result.current.selectedDate).toBe('2026-08-31')
    act(() => vi.advanceTimersByTime(1_000))
    expect(result.current.selectedDate).toBe('2026-09-01')
    expect(result.current.today).toBe('2026-09-01')
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
