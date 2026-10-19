import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useLiveClock } from './useLiveClock'

function Counter({ onRender, enabled = true }: { onRender: () => void; enabled?: boolean }) {
  useLiveClock(enabled)
  onRender()
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
})
