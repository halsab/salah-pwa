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
  it('показывает religious banner первым элементом только для ready live today', () => {
    const religiousDay: typeof day = { ...day, date: '2026-05-23', fajrStart: '02:00', maghrib: '19:00' }
    const now = () => new Date('2026-05-23T12:00:00+03:00')
    const onOpenReligiousEvent = vi.fn()
    const { container, rerender } = render(<ScheduleContent {...base} schedule={religiousDay} schedules={[religiousDay]}
      selectedDate={religiousDay.date} today={religiousDay.date} currentTime={now()} now={now}
      hijriSupported onOpenReligiousEvent={onOpenReligiousEvent} />)
    expect(container.querySelector('.home-content')?.firstElementChild).toHaveAttribute('id', 'religious-event-banner')
    expect(screen.getByRole('button', { name: 'Первые 10 дней Зуль-хиджи День Арафа через 3 дня' })).toBeVisible()
    rerender(<ScheduleContent {...base} schedule={religiousDay} schedules={[religiousDay]}
      selectedDate="2026-05-22" today={religiousDay.date} currentTime={now()} now={now}
      hijriSupported onOpenReligiousEvent={onOpenReligiousEvent} />)
    expect(screen.queryByText('Первые 10 дней Зуль-хиджи')).not.toBeInTheDocument()
  })

  it('оформляет footer главной общим toolbar: ведущий слот слева, icon-only действие справа', () => {
    const actions = <button id="home-settings" type="button">Настройки</button>
    render(<ScheduleContent {...base} actions={actions} />)
    const footer = screen.getByRole('button', { name: 'Настройки' }).closest('.screen-footer')
    expect(footer).toHaveClass('screen-footer--between')
    expect(footer?.querySelector('.screen-footer-lead')).not.toBeNull()
  })

  it.each([
    ['00:10', 'Фаджр (конец сухура)', 'До Фаджра в мечети, осталось 2 ч 12 мин'],
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
    const tomorrow: typeof day = { ...day, date: '2026-05-06', fajrStart: '23:50' }
    const now = () => new Date('2026-05-05T21:10:00+03:00')
    render(<ScheduleContent {...base} schedules={[day, tomorrow]} currentTime={now()} now={now} />)
    expect(screen.getByRole('timer')).toHaveAccessibleName('До Фаджра, осталось 2 ч 40 мин')
  })

  it('после полуночи выбирает события новых гражданских суток места', () => {
    const tomorrow: typeof day = { ...day, date: '2026-05-06', fajrStart: '02:20', fajrJamaat: '03:00', sunrise: '03:50', zenith: '11:41', dhuhr: '12:00', asr: '16:58', maghrib: '19:31', isha: '21:01' }
    const now = () => new Date('2026-05-06T00:01:00+03:00')
    render(<ScheduleContent {...base} schedule={tomorrow} schedules={[day, tomorrow]} selectedDate={tomorrow.date} today={tomorrow.date} currentTime={now()} now={now} />)
    expect(screen.queryByRole('listitem', { current: true })).not.toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveAccessibleName('До Фаджра, осталось 2 ч 19 мин')
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
    const current = screen.getByText('Аср').closest('li')
    const next = screen.getByText('Магриб').closest('li')
    const timer = screen.getByRole('timer')
    expect(current).toHaveAttribute('aria-current', 'true')
    expect(current).toHaveClass('event-current')
    expect(screen.queryByText('сейчас')).not.toBeInTheDocument()
    expect(next).not.toHaveAttribute('aria-current')
    expect(next).not.toHaveClass('event-current')
    expect(screen.getByText('Зухр').closest('li')).toHaveClass('event-past')
    expect(timer).toHaveAccessibleName(/До Магриба, осталось 2 ч 20 мин/)
    expect(timer).toHaveTextContent('До Магриба2 ч 20 мин')
    expect(timer).not.toHaveTextContent('19:30')
    expect(screen.getByText('19:30')).toBeVisible()
    expect(screen.getByRole('list', { name: 'Расписание дня' })).toBeVisible()
  })

  it('сохраняет дату позднего сухура, выделяя текущее событие в полном списке', () => {
    const { container } = render(<ScheduleContent {...base} />)
    const list = screen.getByRole('list', { name: 'Расписание дня' })
    expect(within(list).getByText('23:54')).toHaveAttribute('datetime', '2026-05-04T20:54:00.000Z')
    expect(within(list).getByText('Фаджр (конец сухура)').parentElement).toHaveTextContent('4 мая')
    expect(within(list).getByText('Фаджр в мечети')).toBeVisible()
    expect(container.querySelector('[aria-current="true"]')).toHaveTextContent('Аср16:58')
    expect(within(list).getByText('Зухр').closest('li')).toHaveClass('event-past')
    expect(within(list).getByText('Магриб').closest('li')).not.toHaveClass('event-past')
  })

  it('скрывает устаревшие времена и отсчёт при загрузке и ошибке', () => {
    const { rerender } = render(<ScheduleContent {...base} />)
    rerender(<ScheduleContent {...base} scheduleLoading />)
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.getByText('Загружаем расписание…')).toBeVisible()
    rerender(<ScheduleContent {...base} scheduleError={{ code: 'load-failed' }} />)
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить расписание. Попробуйте ещё раз.')
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeVisible()
  })

  it('локализует ошибку профиля в presentation по стабильному id', () => {
    render(<ScheduleContent {...base} scheduleError={{ code: 'unsupported-profile', profile: 'ummAlQura' }} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Профиль «Умм аль-Кура» недоступен')
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
