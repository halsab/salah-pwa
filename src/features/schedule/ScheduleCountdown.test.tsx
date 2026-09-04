import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ScheduleCountdown } from './ScheduleCountdown'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('ScheduleCountdown', () => {
  it('локально обновляет секунды и один раз сообщает о границе события', () => {
    vi.useFakeTimers()
    let now = new Date('2026-09-01T10:00:00.000Z')
    const onElapsed = vi.fn()
    const { unmount } = render(
      <ScheduleCountdown
        countdownLabel="До асра"
        targetInstant={now.getTime() + 2_000}
        now={() => new Date(now)}
        onElapsed={onElapsed}
      />,
    )

    expect(screen.getByText('00:00:02')).toBeVisible()
    now = new Date(now.getTime() + 1_000)
    act(() => { vi.advanceTimersByTime(1_000) })
    expect(screen.getByText('00:00:01')).toBeVisible()
    expect(onElapsed).not.toHaveBeenCalled()

    now = new Date(now.getTime() + 1_000)
    act(() => { vi.advanceTimersByTime(1_000) })
    expect(onElapsed).toHaveBeenCalledTimes(1)

    act(() => { vi.advanceTimersByTime(5_000) })
    expect(onElapsed).toHaveBeenCalledTimes(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('сразу синхронизируется после возврата в видимую вкладку', () => {
    vi.useFakeTimers()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    let now = new Date('2026-09-01T10:00:00.000Z')
    const targetInstant = now.getTime() + 60_000
    render(
      <ScheduleCountdown
        countdownLabel="До асра"
        targetInstant={targetInstant}
        now={() => new Date(now)}
        onElapsed={vi.fn()}
      />,
    )

    expect(screen.getByText('00:01:00')).toBeVisible()
    expect(vi.getTimerCount()).toBe(1)

    now = new Date(now.getTime() + 30_000)
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })

    expect(screen.getByText('00:00:30')).toBeVisible()
    expect(vi.getTimerCount()).toBe(1)

    now = new Date(now.getTime() + 1_000)
    act(() => { vi.advanceTimersByTime(1_000) })
    expect(screen.getByText('00:00:29')).toBeVisible()
  })

  it('по pageshow один раз сообщает о пропущенной границе и не оставляет stale timeout', () => {
    vi.useFakeTimers()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    let now = new Date('2026-09-01T10:00:00.000Z')
    const onElapsed = vi.fn()
    render(
      <ScheduleCountdown
        countdownLabel="До асра"
        targetInstant={now.getTime() + 10_000}
        now={() => new Date(now)}
        onElapsed={onElapsed}
      />,
    )

    now = new Date(now.getTime() + 20_000)
    act(() => { window.dispatchEvent(new PageTransitionEvent('pageshow')) })

    expect(screen.getByText('00:00:00')).toBeVisible()
    expect(onElapsed).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new PageTransitionEvent('pageshow'))
      vi.advanceTimersByTime(5_000)
    })
    expect(onElapsed).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('при unmount удаляет таймер и слушатели возврата', () => {
    vi.useFakeTimers()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    let now = new Date('2026-09-01T10:00:00.000Z')
    const onElapsed = vi.fn()
    const { unmount } = render(
      <ScheduleCountdown
        countdownLabel="До асра"
        targetInstant={now.getTime() + 10_000}
        now={() => new Date(now)}
        onElapsed={onElapsed}
      />,
    )

    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)

    now = new Date(now.getTime() + 20_000)
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new PageTransitionEvent('pageshow'))
      vi.advanceTimersByTime(20_000)
    })
    expect(onElapsed).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
