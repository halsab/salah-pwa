import { describe, expect, it } from 'vitest'
import { addDays } from './date'
import {
  calendarDateFromCivil, civilDateFromCalendar, daysInCalendarMonth,
  formatCalendarDate, restoreCalendarPreferences,
} from './calendar'

describe('представление гражданской даты в календаре', () => {
  it('показывает Умм аль-Кура и сокращённый месяц на кириллице', () => {
    expect(calendarDateFromCivil('2026-09-10', 'hijri')).toEqual({ year: 1448, month: 3, day: 28 })
    expect(formatCalendarDate('2026-09-10', { calendar: 'hijri', correction: 0 })).toBe('28 раби I')
    expect(formatCalendarDate('2026-09-10', { calendar: 'gregorian', correction: 1 })).toBe('10 сентября')
  })

  it('применяет поправку в обе стороны, включая границу года', () => {
    const lastDay = civilDateFromCalendar({ year: 1447, month: 12, day: daysInCalendarMonth(1447, 12, 'hijri') }, 'hijri')
    expect(calendarDateFromCivil(lastDay, 'hijri', 1)).toEqual({ year: 1448, month: 1, day: 1 })
    expect(civilDateFromCalendar({ year: 1448, month: 1, day: 1 }, 'hijri', 1)).toBe(lastDay)
    expect(calendarDateFromCivil(addDays(lastDay, 1), 'hijri', -1)).toMatchObject({ year: 1447, month: 12 })
  })

  it('определяет длины месяцев и ограничивает день при выборе короткого месяца', () => {
    expect(daysInCalendarMonth(2024, 2, 'gregorian')).toBe(29)
    expect(daysInCalendarMonth(2025, 2, 'gregorian')).toBe(28)
    expect(civilDateFromCalendar({ year: 2025, month: 2, day: 31 }, 'gregorian')).toBe('2025-02-28')
    const shortMonth = Array.from({ length: 12 }, (_, i) => i + 1).find(month => daysInCalendarMonth(1448, month, 'hijri') === 29)
    if (shortMonth === undefined) throw new Error('Нет короткого месяца')
    const date = civilDateFromCalendar({ year: 1448, month: shortMonth, day: 30 }, 'hijri')
    expect(calendarDateFromCivil(date, 'hijri')).toEqual({ year: 1448, month: shortMonth, day: 29 })
  })

  it('обратимо преобразует даты разных столетий без локальной таймзоны', () => {
    for (const date of ['1900-01-01', '2000-02-29', '2026-09-10', '2035-12-31', '2100-12-31']) {
      for (const correction of [-1, 0, 1] as const) {
        for (const calendar of ['gregorian', 'hijri'] as const) {
          expect(civilDateFromCalendar(calendarDateFromCivil(date, calendar, correction), calendar, correction)).toBe(date)
        }
      }
    }
  })

  it.each([undefined, null, {}, { calendar: 'islamic', correction: 0 }, { calendar: 'hijri', correction: 2 }])('восстанавливает безопасные настройки из %j', value => {
    expect(restoreCalendarPreferences(value)).toEqual({ calendar: 'gregorian', correction: 0 })
  })
})
