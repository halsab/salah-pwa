import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { ScheduleCountdown } from './ScheduleCountdown'

afterEach(() => {
  vi.useRealTimers()
})

it('removes the countdown and reports its event once when the target is reached', () => {
  vi.useFakeTimers()
  let now = new Date('2026-09-01T10:00:00.000Z')
  const targetInstant = now.getTime() + 1_000
  const onElapsed = vi.fn()

  render(<ScheduleCountdown
    countdownLabel="Next"
    targetInstant={targetInstant}
    now={() => new Date(now)}
    onElapsed={onElapsed}
  />)

  expect(screen.getByRole('timer')).toBeVisible()
  now = new Date(targetInstant)
  act(() => { vi.advanceTimersByTime(1_000) })

  expect(screen.queryByRole('timer')).not.toBeInTheDocument()
  expect(onElapsed).toHaveBeenCalledOnce()

  act(() => { vi.advanceTimersByTime(5_000) })
  expect(onElapsed).toHaveBeenCalledOnce()
})
