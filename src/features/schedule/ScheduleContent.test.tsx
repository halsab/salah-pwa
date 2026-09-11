import { required } from '../../test/required'
import { act, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { parseDumRtCsv } from '../../data/parseDumRtCsv'
import { calculatePrayerSchedule } from '../../domain/prayerCalculation'
import { ScheduleContent } from './ScheduleContent'

const day = required(parseDumRtCsv('05.05.2026;23:54;02:22;03:53;11:41;12:00;16:58;19:30;21:00', 'kazan')[0])
const base = {
  schedule: day, schedules: [day], scheduleLoading: false, scheduleError: null,
  selectedDate: day.date, today: day.date, currentTime: new Date('2026-05-05T17:10:00+03:00'),
  now: () => new Date('2026-05-05T17:10:00+03:00'), officialMode: true,
  onChangeDate: () => {}, onRetrySchedule: () => {},
}

describe('новое расписание', () => {
  it.each([
    ['00:10', 'Сухур до', 'До Фаджра в мечети, осталось 2 ч 12 мин'],
    ['04:00', 'Восход', 'До зенита, осталось 7 ч 41 мин'],
    ['11:45', 'Зенит', 'До Зухра, осталось 15 мин'],
  ])('учитывает все события на главной в %s', (time, current, countdown) => {
    const now = () => new Date(`2026-05-05T${time}:00+03:00`)
    render(<ScheduleContent {...base} currentTime={now()} now={now} />)
    const list = screen.getByRole('list', { name: 'Расписание дня' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(8)
    expect(within(list).getByText(current).closest('li')).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('timer')).toHaveAccessibleName(countdown)
  })

  it('на границе восхода выделяет восход и начинает отсчёт до зенита', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-05-05T03:52:59+03:00'))
      const now = () => new Date()
      render(<ScheduleContent {...base} currentTime={now()} now={now} />)
      expect(screen.getByRole('timer')).toHaveAccessibleName('До восхода, осталось < 1 мин')
      act(() => { vi.advanceTimersByTime(1000) })
      expect(screen.getByText('Восход').closest('li')).toHaveAttribute('aria-current', 'true')
      expect(screen.getByRole('timer')).toHaveAccessibleName('До зенита, осталось 7 ч 48 мин')
    } finally { vi.useRealTimers() }
  })

  it('после Иши считает до позднего сухура следующей строки', () => {
    const tomorrow: typeof day = { ...day, date: '2026-05-06', suhurEnd: '23:50' }
    const now = () => new Date('2026-05-05T21:10:00+03:00')
    render(<ScheduleContent {...base} schedules={[day, tomorrow]} currentTime={now()} now={now} />)
    expect(screen.getByRole('timer')).toHaveAccessibleName('До конца сухура, осталось 2 ч 40 мин')
  })

  it('учитывает восход и зенит в расчётном расписании', () => {
    const calculated = calculatePrayerSchedule({ latitude: 55.75, longitude: 37.62 }, day.date, 'Europe/Moscow')
    const now = () => new Date(calculated.entries.sunrise.instant + 60_000)
    render(<ScheduleContent {...base} schedule={calculated} schedules={[calculated]} currentTime={now()} now={now} officialMode={false} />)
    expect(screen.getByText('Восход').closest('li')).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('timer')).toHaveAccessibleName(/^До зенита/)
  })

  it('при переводе часов назад принимает новое текущее время после границы события', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-05-05T19:29:59+03:00'))
      const now = () => new Date()
      const { rerender } = render(<ScheduleContent {...base} currentTime={now()} now={now} />)
      act(() => { vi.advanceTimersByTime(1000) })
      expect(screen.getByText('Магриб').closest('li')).toHaveAttribute('aria-current', 'true')
      vi.setSystemTime(new Date('2026-05-05T19:20:00+03:00'))
      rerender(<ScheduleContent {...base} currentTime={now()} now={now} />)
      expect(screen.getByText('Аср').closest('li')).toHaveAttribute('aria-current', 'true')
    } finally { vi.useRealTimers() }
  })
  it('на границе события обновляет текущее время и следующий отсчёт', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-05-05T19:29:59+03:00'))
      const now = () => new Date()
      render(<ScheduleContent {...base} currentTime={now()} now={now} />)
      expect(screen.getByRole('timer')).toHaveTextContent('< 1 мин')
      act(() => { vi.advanceTimersByTime(1000) })
      expect(screen.getByText('Магриб').closest('li')).toHaveAttribute('aria-current', 'true')
      expect(screen.getByRole('timer')).toHaveAccessibleName(/До Иши, осталось 1 ч 30 мин/)
    } finally { vi.useRealTimers() }
  })
  it('показывает текущий Аср, его начало и отсчёт до Магриба на главной', () => {
    render(<ScheduleContent {...base} />)
    expect(screen.getByText('Аср').closest('li')).toHaveAttribute('aria-current', 'true')
    expect(screen.getByText('Зухр').closest('li')).toHaveClass('event-past')
    expect(screen.getByRole('timer')).toHaveAccessibleName(/До Магриба, осталось 2 ч 20 мин/)
    expect(screen.getByText('19:30')).toBeVisible()
    expect(screen.getByRole('list', { name: 'Расписание дня' })).toBeVisible()
  })

  it('сохраняет дату позднего сухура, выделяя текущее событие в полном списке', () => {
    const { container } = render(<ScheduleContent {...base} />)
    const list = screen.getByRole('list', { name: 'Расписание дня' })
    expect(within(list).getByText('23:54')).toHaveAttribute('datetime', '2026-05-04T20:54:00.000Z')
    expect(within(list).getByText('Сухур до').parentElement).toHaveTextContent('4 мая')
    expect(within(list).getByText('Фаджр в мечети')).toBeVisible()
    expect(container.querySelector('[aria-current="true"]')).toHaveTextContent('Асрсейчас16:58')
    expect(within(list).getByText('Зухр').closest('li')).toHaveClass('event-past')
    expect(within(list).getByText('Магриб').closest('li')).not.toHaveClass('event-past')
  })

  it('скрывает устаревшие времена и отсчёт при загрузке и ошибке', () => {
    const { rerender } = render(<ScheduleContent {...base} />)
    rerender(<ScheduleContent {...base} scheduleLoading />)
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.getByText('Загружаем расписание…')).toBeVisible()
    rerender(<ScheduleContent {...base} scheduleError="Ошибка данных" />)
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Ошибка данных')
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeVisible()
  })

  it('для другого дня не показывает текущую метку и живой отсчёт', () => {
    render(<ScheduleContent {...base} today="2026-05-06" />)
    expect(screen.queryByText('сейчас')).not.toBeInTheDocument()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Сегодня' })).toBeVisible()
  })

  it('не переносит текущий Фаджр соседнего расписания на строку выбранного дня', () => {
    const today = calculatePrayerSchedule({ latitude: 55.75, longitude: 37.62 }, '2026-12-31', 'Europe/Moscow')
    const tomorrow = calculatePrayerSchedule({ latitude: 55.75, longitude: 37.62 }, '2027-01-01', 'Europe/Moscow')
    tomorrow.entries.fajr = { instant: Date.parse('2026-12-31T23:55:00+03:00'), time: '23:55', estimated: false }
    const now = () => new Date('2026-12-31T23:56:00+03:00')
    const { container } = render(<ScheduleContent {...base} schedule={today} schedules={[tomorrow, today]} selectedDate={today.date} today={today.date} currentTime={now()} now={now} officialMode={false} />)
    expect(container.querySelector('[aria-current="true"]')).toBeNull()
  })
})
