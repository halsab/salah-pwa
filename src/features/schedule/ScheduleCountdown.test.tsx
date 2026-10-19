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
    vi.setSystemTime(now)
    const onElapsed = vi.fn()
    const { unmount } = render(
      <ScheduleCountdown
        countdownLabel="До асра"
        targetInstant={now.getTime() + 2_000}
        now={() => new Date(now)}
        onElapsed={onElapsed}
      />,
    )

    expect(screen.getByText('2 сек')).toBeVisible()
    now = new Date(now.getTime() + 1_000)
    act(() => { vi.advanceTimersByTime(1_000) })
    expect(screen.getByText('1 сек')).toBeVisible()
    expect(onElapsed).not.toHaveBeenCalled()

    now = new Date(now.getTime() + 1_000)
    act(() => { vi.advanceTimersByTime(1_000) })
    expect(onElapsed).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()

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

    expect(screen.getByText('1 мин')).toBeVisible()
    expect(vi.getTimerCount()).toBe(2)

    now = new Date(now.getTime() + 30_000)
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })

    expect(screen.getByText('30 сек')).toBeVisible()
    expect(vi.getTimerCount()).toBe(2)

    now = new Date(now.getTime() + 1_000)
    act(() => { vi.advanceTimersByTime(1_000) })
    expect(screen.getByText('29 сек')).toBeVisible()
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

    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
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

  it('перепроверяет границу после перевода системных часов назад', () => {
    vi.useFakeTimers()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const start = new Date('2026-09-01T10:00:00.000Z')
    let now = start
    vi.setSystemTime(start)
    const targetInstant = start.getTime() + 2_000
    const onElapsed = vi.fn()
    render(<ScheduleCountdown countdownLabel="До асра" targetInstant={targetInstant}
      now={() => new Date(now)} onElapsed={onElapsed} />)

    now = new Date(start.getTime() + 1_000)
    vi.setSystemTime(now)
    act(() => { vi.advanceTimersByTime(1_000) })
    expect(screen.getByText('1 сек')).toBeVisible()

    now = new Date(start.getTime() + 500)
    vi.setSystemTime(now)
    act(() => { vi.advanceTimersByTime(1_000) })
    expect(screen.getByText('1 сек')).toBeVisible()
    expect(onElapsed).not.toHaveBeenCalled()

    now = new Date(targetInstant)
    vi.setSystemTime(now)
    act(() => { window.dispatchEvent(new PageTransitionEvent('pageshow')) })
    expect(onElapsed).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
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

    expect(vi.getTimerCount()).toBe(2)
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

  it('переключает часы, минуты и секунды на точных порогах', () => {
    vi.useFakeTimers()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    let now = new Date('2026-09-01T10:00:00.000Z')
    vi.setSystemTime(now)
    const targetInstant = now.getTime() + 3_600_000
    render(
      <ScheduleCountdown
        countdownLabel="До асра"
        targetInstant={targetInstant}
        now={() => new Date(now)}
        onElapsed={vi.fn()}
      />,
    )

    expect(screen.getByText('1 ч 0 мин')).toBeVisible()
    now = new Date(targetInstant - 3_599_999)
    act(() => { window.dispatchEvent(new PageTransitionEvent('pageshow')) })
    expect(screen.getByText('59 мин')).toBeVisible()

    now = new Date(targetInstant - 60_000)
    act(() => { window.dispatchEvent(new PageTransitionEvent('pageshow')) })
    expect(screen.getByText('1 мин')).toBeVisible()
    now = new Date(targetInstant - 59_999)
    act(() => { window.dispatchEvent(new PageTransitionEvent('pageshow')) })
    expect(screen.getByText('59 сек')).toBeVisible()
  })

  it('не показывает countdown для отсутствующего или уже прошедшего target', () => {
    vi.useFakeTimers()
    const now = new Date('2026-09-01T10:00:00.000Z')
    const { rerender } = render(
      <ScheduleCountdown countdownLabel="До асра" targetInstant={Number.NaN} now={() => now} onElapsed={vi.fn()} />,
    )
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    rerender(<ScheduleCountdown countdownLabel="До асра" targetInstant={now.getTime() - 1} now={() => now} onElapsed={vi.fn()} />)
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
  })

  it('не показывает countdown и не создаёт цикл таймера при некорректных часах', () => {
    vi.useFakeTimers()
    render(<ScheduleCountdown countdownLabel="До асра" targetInstant={Date.now() + 60_000}
      now={() => new Date(Number.NaN)} onElapsed={vi.fn()} />)

    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(vi.getTimerCount()).toBe(0)
  })
})
