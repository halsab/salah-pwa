import { required } from '../../test/required'
import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { parseDumRtCsv } from '../../data/parseDumRtCsv'
import { calculatePrayerSchedule, DEFAULT_CALCULATION_SETTINGS } from '../../domain/prayerCalculation'
import { ScheduleContent } from './ScheduleContent'

const day = required(parseDumRtCsv('05.05.2026;23:54;02:22;03:53;11:41;12:00;16:58;19:30;21:00', 'kazan')[0])
const base = {
  schedule: day, schedules: [day], scheduleLoading: false, scheduleError: null,
  selectedDate: day.date, today: day.date, currentTime: new Date('2026-05-05T09:00:00+03:00'),
  now: () => new Date('2026-05-05T09:00:00+03:00'), officialMode: true,
  calculationSettings: DEFAULT_CALCULATION_SETTINGS, officialScheduleUrl: 'https://dumrt.ru/ru/help-info/prayertime/',
  methodologyButtonRef: createRef<HTMLButtonElement>(), onChangeDate: () => {}, onRetrySchedule: () => {}, onOpenMethodology: () => {},
}

describe('ScheduleContent', () => {
  it('сохраняет спорное значение без неподтверждённого datetime и считает до намаза', () => {
    render(<ScheduleContent {...base} />)
    expect(screen.getByText('23:54')).toBeVisible()
    expect(screen.getByText('23:54')).not.toHaveAttribute('datetime')
    expect(screen.queryByText(/Дата завершения сухура.*не уточнена/)).not.toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveAccessibleName(/До зухра/)
  })

  it('loading одновременно скрывает таблицу, подсветку и countdown', () => {
    const { rerender, container } = render(<ScheduleContent {...base} />)
    expect(screen.getByRole('timer')).toBeVisible()
    rerender(<ScheduleContent {...base} scheduleLoading />)
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Расписание дня' })).not.toBeInTheDocument()
    expect(container.querySelector('[data-active]')).toBeNull()
    expect(screen.getByLabelText('Загружаем расписание')).toBeVisible()
  })

  it('перед полуночью не подсвечивает прошедший Фаджр соседнего расписания', () => {
    const today = calculatePrayerSchedule({ latitude: 55.75, longitude: 37.62 }, '2026-12-31', 'Europe/Moscow')
    const tomorrow = calculatePrayerSchedule({ latitude: 55.75, longitude: 37.62 }, '2027-01-01', 'Europe/Moscow')
    tomorrow.entries.fajr = { instant: Date.parse('2026-12-31T23:55:00+03:00'), time: '23:55', estimated: false }
    const now = () => new Date('2026-12-31T23:56:00+03:00')
    const { container } = render(<ScheduleContent {...base} schedule={today} schedules={[tomorrow, today]} selectedDate={today.date} today={today.date} currentTime={now()} now={now} officialMode={false} />)
    expect(screen.queryByText('Фаджр · 23:55')).not.toBeInTheDocument()
    expect(container.querySelector('[data-active]')).toBeNull()
  })
})

it('выделяет следующий намаз и его время, без конкурирующего предыдущего события', () => {
  const { container } = render(<ScheduleContent {...base} />)
  expect(screen.getByRole('region', { name: 'Следующий намаз' })).toHaveTextContent('Зухр')
  expect(container.querySelector('.prayer-row[data-active]')).toHaveTextContent('Зухр')
  expect(screen.queryByText('Последнее событие')).not.toBeInTheDocument()
})
