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
    const { result, unmount } = renderHook(() => useScheduleDate(services))
    const initialTime = result.current.currentTime

    act(() => { vi.advanceTimersByTime(1_000) })
    expect(result.current.currentTime).toBe(initialTime)

    act(() => { vi.advanceTimersByTime(59_000) })
    expect(result.current.currentTime.toISOString()).toBe(
      '2026-09-01T10:01:00.000Z',
    )

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('хранит только явную дату и позволяет вернуться к эффективному сегодня', () => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-10-12T21:30:00.000Z')
    const services = { now: () => new Date(Date.now()) }
    const { result, unmount } = renderHook(() => useScheduleDate(services))

    expect(result.current.selectedDateOverride).toBeNull()
    act(() => result.current.changeDate('2026-08-30'))
    expect(result.current.selectedDateOverride).toBe('2026-08-30')
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(result.current.selectedDateOverride).toBe('2026-08-30')
    act(() => result.current.changeDate(null))
    expect(result.current.selectedDateOverride).toBeNull()
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
