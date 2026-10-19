import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useClockCorrection, useLiveClock } from './useLiveClock'

function Counter({ onRender, enabled = true }: {
  onRender: () => void
  enabled?: boolean
}) {
  useLiveClock(enabled)
  onRender()
  return null
}

function ClockCorrectionObserver({ onSystemClockChange }: { onSystemClockChange: () => void }) {
  useClockCorrection(true, onSystemClockChange)
  return null
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useLiveClock', () => {
  it('shares one aligned clock and only updates active consumers', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-19T10:00:00.250Z'))
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const firstRender = vi.fn()
    const secondRender = vi.fn()
    const { unmount } = render(<>
      <Counter onRender={firstRender} />
      <Counter onRender={secondRender} />
      <Counter onRender={vi.fn()} enabled={false} />
    </>)

    expect(vi.getTimerCount()).toBe(1)
    act(() => { vi.advanceTimersByTime(750) })
    expect(firstRender).toHaveBeenCalledTimes(2)
    expect(secondRender).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(1)

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('pauses while hidden and immediately synchronizes after foreground recovery', () => {
    vi.useFakeTimers()
    let visibility: DocumentVisibilityState = 'visible'
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
    const onRender = vi.fn()
    const { unmount } = render(<Counter onRender={onRender} />)
    expect(vi.getTimerCount()).toBe(1)

    visibility = 'hidden'
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(vi.getTimerCount()).toBe(0)
    const rendersWhileHidden = onRender.mock.calls.length
    act(() => { vi.advanceTimersByTime(5_000) })
    expect(onRender).toHaveBeenCalledTimes(rendersWhileHidden)

    visibility = 'visible'
    act(() => { window.dispatchEvent(new PageTransitionEvent('pageshow')) })
    expect(onRender).toHaveBeenCalledTimes(rendersWhileHidden + 1)
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('notifies parent observers only when wall time jumps relative to monotonic time', () => {
    vi.useFakeTimers()
    const start = new Date('2026-10-19T10:00:00.000Z')
    vi.setSystemTime(start)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const onSystemClockChange = vi.fn()
    const { unmount } = render(<>
      <ClockCorrectionObserver onSystemClockChange={onSystemClockChange} />
      <ClockCorrectionObserver onSystemClockChange={onSystemClockChange} />
    </>)

    expect(vi.getTimerCount()).toBe(1)
    act(() => { vi.advanceTimersByTime(1_000) })
    expect(onSystemClockChange).not.toHaveBeenCalled()

    vi.setSystemTime(new Date(Date.now() + 5 * 60 * 60_000))
    act(() => { vi.advanceTimersByTime(1_000) })
    expect(onSystemClockChange).toHaveBeenCalledTimes(1)

    vi.setSystemTime(new Date(Date.now() - 8 * 60 * 60_000))
    act(() => { vi.advanceTimersByTime(1_000) })
    expect(onSystemClockChange).toHaveBeenCalledTimes(2)

    act(() => { vi.advanceTimersByTime(1_000) })
    expect(onSystemClockChange).toHaveBeenCalledTimes(2)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
