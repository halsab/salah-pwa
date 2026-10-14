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
  it('показывает дневное состояние и пересчитывает обратный отсчёт и прогресс', () => {
    renderCard('2026-03-10T01:00:00Z', [day('2026-03-09'), day('2026-03-10', '04:04'), day('2026-03-11')])
    expect(screen.getByText('Пост')).toBeVisible()
    expect(screen.getByText('0 ч 04 мин')).toBeVisible()
    expect(screen.getByText('До конца поста')).toBeVisible()
    expect(screen.getByRole('timer')).toHaveTextContent('00:04')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
    expect(screen.getByRole('progressbar').firstElementChild).toHaveClass('fasting-progress-fill')
    expect(screen.getByRole('group', { name: 'Начало 04:00; Конец 04:04' })).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(120_000) })
    expect(screen.getByRole('timer')).toHaveTextContent('00:02')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
    act(() => { vi.advanceTimersByTime(119_000) })
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })

  it('показывает ночное состояние с датами событий и без длительности', () => {
    renderCard('2026-03-10T18:00:00Z')
    expect(screen.getByText('Пост')).toBeVisible()
    expect(screen.queryByText(/ч \d{2} мин/u)).not.toBeInTheDocument()
    expect(screen.getByText('До начала поста')).toBeVisible()
    expect(screen.getByRole('timer')).toHaveTextContent('07:00')
    expect(screen.getByRole('group', { name: 'Конец сегодня 19:00; Начало завтра 04:00' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Прогресс времени до начала поста' })).toHaveAttribute('aria-valuenow', '22')
  })

  it('сверяет часы при возвращении вкладки после паузы', () => {
    const { now } = renderCard('2026-03-10T01:00:00Z', [day('2026-03-09'), day('2026-03-10', '04:04'), day('2026-03-11')])
    act(() => { vi.setSystemTime(new Date('2026-03-10T01:02:00Z')); window.dispatchEvent(new Event('pageshow')) })
    expect(screen.getByRole('timer')).toHaveTextContent('00:02')
    act(() => { vi.setSystemTime(new Date('2026-03-10T01:03:00Z')); document.dispatchEvent(new Event('visibilitychange')) })
    expect(screen.getByRole('timer')).toHaveTextContent('00:01')
    expect(now()).toEqual(new Date('2026-03-10T01:03:00Z'))
  })

  it('убирает карточку, если выбран день не сегодня', () => {
    const { rerender } = renderCard('2026-03-10T01:00:00Z')
    rerender(<FastingCard events={buildFastingScheduleEvents([day('2026-03-10')], 'Europe/Moscow')}
      preferences={{ manualEnabled: true }} selectedDate="2026-03-09" today="2026-03-10" timeZone="Europe/Moscow"
      correction={0} hijriSupported now={() => new Date('2026-03-10T01:00:00Z')} />)
    expect(screen.queryByText('Пост')).not.toBeInTheDocument()
  })
})
