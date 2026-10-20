import { required } from '../../test/required'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { parseDumRtCsv } from '../../data/parseDumRtCsv'
import { ScheduleContent } from './ScheduleContent'

const day = required(parseDumRtCsv('05.05.2026;23:54;02:22;03:53;11:41;12:00;16:58;19:30;21:00', 'kazan')[0])
const base = {
  schedule: day, schedules: [day], scheduleLoading: false, scheduleError: null,
  selectedDate: day.date, today: day.date, currentTime: new Date('2026-05-05T17:10:00+03:00'),
  now: () => new Date('2026-05-05T17:10:00+03:00'), officialMode: true,
  onChangeDate: () => {}, onRetrySchedule: () => {},
}

describe('новое расписание', () => {
  it('скрывает устаревшие времена и отсчёт при загрузке и ошибке', () => {
    const { rerender } = render(<ScheduleContent {...base} />)
    rerender(<ScheduleContent {...base} scheduleLoading />)
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toBeVisible()
    rerender(<ScheduleContent {...base} scheduleError={{ code: 'load-failed' }} />)
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeVisible()
  })

  it('для другого дня не показывает текущую метку и живой отсчёт', () => {
    render(<ScheduleContent {...base} today="2026-05-06" />)
    const activeRows = screen.getAllByRole('listitem').filter(row => row.getAttribute('aria-current') === 'true')
    expect(activeRows).toHaveLength(0)
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Сегодня' })).toBeVisible()
  })

  it('заменяет оба countdown при обновлении расписания и timezone', () => {
    const tokyo = { ...day, timeZone: 'Asia/Tokyo' }
    const now = () => new Date('2026-05-05T09:00:00Z')
    const props = { ...base, schedule: day, schedules: [day, { ...day, date: '2026-05-06' }],
      selectedDate: day.date, today: day.date, currentTime: now(), now, officialMode: false,
      hijriSupported: false, fastingMode: { manualEnabled: true }, fastingModeEnabled: true }
    const { rerender } = render(<ScheduleContent {...props} timeZone="Europe/Moscow" />)
    expect(screen.getByRole('timer', { name: /До Аср/ })).toBeVisible()

    rerender(<ScheduleContent {...props} schedule={tokyo} schedules={[tokyo, { ...tokyo, date: '2026-05-06' }]}
      timeZone="Asia/Tokyo" />)
    expect(screen.getByRole('timer', { name: /До Магриб/ })).toBeVisible()
    expect(screen.getByRole('timer', { name: /До конца поста/ })).toBeVisible()
    expect(screen.queryByRole('timer', { name: /До Аср/ })).not.toBeInTheDocument()
  })

})
