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
    expect(screen.getByRole('timer')).toHaveTextContent('4 мин')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
    expect(screen.getByRole('progressbar').firstElementChild).toHaveClass('fasting-progress-fill')
    expect(screen.getByRole('group', { name: 'Начало 04:00; Конец 04:04' })).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(120_000) })
    expect(screen.getByRole('timer')).toHaveTextContent('2 мин')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
    act(() => { vi.advanceTimersByTime(119_000) })
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })

  it('показывает ночное состояние с датами событий и без длительности', () => {
    renderCard('2026-03-10T18:00:00Z')
    expect(screen.getByText('Пост')).toBeVisible()
    expect(screen.queryByText(/ч \d{2} мин/u)).not.toBeInTheDocument()
    expect(screen.getByText('До начала поста')).toBeVisible()
    expect(screen.getByRole('timer')).toHaveTextContent('7 ч 0 мин')
    expect(screen.getByRole('group', { name: 'Конец сегодня 19:00; Начало завтра 04:00' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Прогресс времени до начала поста' })).toHaveAttribute('aria-valuenow', '22')
  })

  it('сверяет часы при возвращении вкладки после паузы', () => {
    const { now } = renderCard('2026-03-10T01:00:00Z', [day('2026-03-09'), day('2026-03-10', '04:04'), day('2026-03-11')])
    act(() => { vi.setSystemTime(new Date('2026-03-10T01:02:00Z')); window.dispatchEvent(new Event('pageshow')) })
    expect(screen.getByRole('timer')).toHaveTextContent('2 мин')
    act(() => { vi.setSystemTime(new Date('2026-03-10T01:03:00Z')); document.dispatchEvent(new Event('visibilitychange')) })
    expect(screen.getByRole('timer')).toHaveTextContent('1 мин')
    expect(now()).toEqual(new Date('2026-03-10T01:03:00Z'))
  })

  it('убирает карточку, если выбран день не сегодня', () => {
    const { rerender } = renderCard('2026-03-10T01:00:00Z')
    rerender(<FastingCard events={buildFastingScheduleEvents([day('2026-03-10')], 'Europe/Moscow')}
      preferences={{ manualEnabled: true }} selectedDate="2026-03-09" today="2026-03-10" timeZone="Europe/Moscow"
      correction={0} hijriSupported now={() => new Date('2026-03-10T01:00:00Z')} />)
    expect(screen.queryByText('Пост')).not.toBeInTheDocument()
  })

  it('переходит от минут к секундам и сразу выбирает следующую фазу на Магрибе', () => {
    const schedules = [day('2026-03-09'), day('2026-03-10', '04:01'), day('2026-03-11')]
    renderCard('2026-03-10T01:00:01Z', schedules)
    expect(screen.getByRole('timer')).toHaveTextContent('59 сек')

    act(() => {
      vi.setSystemTime(new Date('2026-03-10T01:01:00Z'))
      window.dispatchEvent(new PageTransitionEvent('pageshow'))
    })
    expect(screen.getByText('До начала поста')).toBeVisible()
    expect(screen.getByRole('timer')).toHaveTextContent('23 ч 59 мин')
    expect(screen.queryByText('0 сек')).not.toBeInTheDocument()
  })

  it('обновляет относительные endpoint labels при переходе через полночь', () => {
    const schedules = [
      { ...day('2026-03-10', '23:30'), fajrStart: '00:30' as PrayerTime },
      { ...day('2026-03-11', '23:30'), fajrStart: '00:30' as PrayerTime },
    ]
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-10T20:59:00Z'))
    const now = () => new Date()
    const events = buildFastingScheduleEvents(schedules, 'Europe/Moscow')
    const props = { events, preferences: { manualEnabled: true }, selectedDate: '2026-03-10', today: '2026-03-10',
      timeZone: 'Europe/Moscow', correction: 0 as const, hijriSupported: false, now }
    const { rerender } = render(<FastingCard {...props} />)
    expect(screen.getByRole('group', { name: 'Конец сегодня 23:30; Начало завтра 00:30' })).toBeInTheDocument()

    act(() => { vi.setSystemTime(new Date('2026-03-10T21:00:00Z')) })
    rerender(<FastingCard {...props} selectedDate="2026-03-11" today="2026-03-11" />)
    expect(screen.getByRole('group', { name: 'Конец вчера 23:30; Начало сегодня 00:30' })).toBeInTheDocument()
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
    expect(screen.queryByText('NaN')).not.toBeInTheDocument()
  })

  it('скрывает карточку при некорректном текущем времени', () => {
    const events = buildFastingScheduleEvents([day('2026-03-10'), day('2026-03-11')], 'Europe/Moscow')
    render(<FastingCard events={events} preferences={{ manualEnabled: true }} selectedDate="2026-03-10"
      today="2026-03-10" timeZone="Europe/Moscow" correction={0} hijriSupported={false}
      now={() => new Date(Number.NaN)} />)

    expect(screen.queryByText('Пост')).not.toBeInTheDocument()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
  })
})
