import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildFastingScheduleEvents } from '../../domain/fasting'
import type { PrayerDay, PrayerTime } from '../../domain/types'
import { FastingCard } from './FastingCard'

function day(date: string, maghrib: PrayerTime = '19:00'): PrayerDay {
  return { locationId: 'test', date, timeZone: 'Europe/Moscow', fajrStart: '04:00', fajrJamaat: '04:30',
    sunrise: '06:00', zenith: '12:00', dhuhr: '12:10', asr: '16:00', maghrib, isha: '21:00' }
}

function renderCard(initialTime: string, schedules = [day('2026-03-09'), day('2026-03-10'), day('2026-03-11')]) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(initialTime))
  const now = () => new Date()
  const events = buildFastingScheduleEvents(schedules, 'Europe/Moscow')
  const result = render(<FastingCard events={events} preferences={{ manualEnabled: true }} selectedDate="2026-03-10"
    today="2026-03-10" timeZone="Europe/Moscow" correction={0} hijriSupported now={now} />)
  return { ...result, now }
}

afterEach(() => vi.useRealTimers())

describe('карточка поста', () => {
  it('updates accessible fasting progress as live time passes', () => {
    renderCard('2026-03-10T01:00:00Z', [day('2026-03-09'), day('2026-03-10', '04:04'), day('2026-03-11')])
    expect(screen.getByRole('timer')).toBeVisible()
    const progress = screen.getByRole('progressbar')
    const initialProgress = progress.getAttribute('aria-valuenow')

    act(() => { vi.advanceTimersByTime(120_000) })

    expect(progress).not.toHaveAttribute('aria-valuenow', initialProgress)
  })

  it('убирает карточку, если выбран день не сегодня', () => {
    const { rerender } = renderCard('2026-03-10T01:00:00Z')
    rerender(<FastingCard events={buildFastingScheduleEvents([day('2026-03-10')], 'Europe/Moscow')}
      preferences={{ manualEnabled: true }} selectedDate="2026-03-09" today="2026-03-10" timeZone="Europe/Moscow"
      correction={0} hijriSupported now={() => new Date('2026-03-10T01:00:00Z')} />)
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('не показывает countdown для несогласованных schedule events', () => {
    const validEvents = buildFastingScheduleEvents([day('2026-03-09'), day('2026-03-10'), day('2026-03-11')], 'Europe/Moscow')
    const invalidEvents = {
      fajr: validEvents.fajr.map(event => ({ ...event, instant: Number.NaN })),
      maghrib: validEvents.maghrib.map(event => ({ ...event, instant: Number.POSITIVE_INFINITY })),
    }
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-10T01:00:00Z'))
    render(<FastingCard events={invalidEvents} preferences={{ manualEnabled: true }} selectedDate="2026-03-10"
      today="2026-03-10" timeZone="Europe/Moscow" correction={0} hijriSupported={false} now={() => new Date()} />)
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
  })

})
