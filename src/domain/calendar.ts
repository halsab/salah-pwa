import { addDays, formatCompactDateLabel } from './date'

export type CalendarKind = 'gregorian' | 'hijri'
export type DateCorrection = -1 | 0 | 1
export interface CalendarPreferences { calendar: CalendarKind; correction: DateCorrection }
export interface CalendarDate { year: number; month: number; day: number }

export const DEFAULT_CALENDAR_PREFERENCES: CalendarPreferences = { calendar: 'gregorian', correction: 0 }
export const GREGORIAN_MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'] as const
export const HIJRI_MONTHS = ['мухаррам', 'сафар', 'раби аль-авваль', 'раби ас-сани', 'джумада аль-уля', 'джумада ас-сания', 'раджаб', 'шаабан', 'рамадан', 'шавваль', 'зуль-када', 'зуль-хиджа'] as const
const COMPACT_HIJRI_MONTHS = ['мухаррам', 'сафар', 'раби I', 'раби II', 'джумада I', 'джумада II', 'раджаб', 'шаабан', 'рамадан', 'шавваль', 'зуль-када', 'зуль-хиджа'] as const
const DAY_MS = 86_400_000
let hijriFormatter: Intl.DateTimeFormat | undefined

function getHijriFormatter() {
  hijriFormatter ??= new Intl.DateTimeFormat('en-GB', {
    calendar: 'islamic-umalqura', numberingSystem: 'latn', timeZone: 'UTC',
    year: 'numeric', month: 'numeric', day: 'numeric',
  })
  if (hijriFormatter.resolvedOptions().calendar !== 'islamic-umalqura') throw new Error('Календарь хиджры недоступен')
  return hijriFormatter
}

export function supportsHijriCalendar(): boolean {
  try { getHijriFormatter(); return true } catch { return false }
}

export function isCalendarPreferences(value: unknown): value is CalendarPreferences {
  return Boolean(value && typeof value === 'object'
    && 'calendar' in value && (value.calendar === 'gregorian' || value.calendar === 'hijri')
    && 'correction' in value && (value.correction === -1 || value.correction === 0 || value.correction === 1))
}

export function restoreCalendarPreferences(value: unknown): CalendarPreferences {
  return isCalendarPreferences(value) ? value : DEFAULT_CALENDAR_PREFERENCES
}

function utcDate(year: number, month: number, day: number): Date {
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  return date
}

function hijriParts(date: Date): CalendarDate {
  const parts = getHijriFormatter().formatToParts(date)
  const number = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value)
  return { year: number('year'), month: number('month'), day: number('day') }
}

export function calendarDateFromCivil(date: string, calendar: CalendarKind, correction: DateCorrection = 0): CalendarDate {
  if (calendar === 'hijri') return hijriParts(new Date(`${addDays(date, correction)}T12:00:00Z`))
  const instant = new Date(`${date}T12:00:00Z`)
  return { year: instant.getUTCFullYear(), month: instant.getUTCMonth() + 1, day: instant.getUTCDate() }
}

function monthStart(year: number, month: number, calendar: CalendarKind): number {
  if (calendar === 'gregorian') return utcDate(year, month, 1).getTime() / DAY_MS
  // Средняя длина лунного года задаёт только границы поиска; точную дату определяет Умм аль-Кура в Intl.
  const approximateYear = Math.floor(621.5774 + year * 0.970224)
  let low = utcDate(approximateYear - 2, 1, 1).getTime() / DAY_MS
  let high = utcDate(approximateYear + 2, 1, 1).getTime() / DAY_MS
  const target = year * 12 + month
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    const parts = hijriParts(new Date(middle * DAY_MS))
    if (parts.year * 12 + parts.month < target) low = middle + 1
    else high = middle
  }
  const found = hijriParts(new Date(low * DAY_MS))
  if (found.year !== year || found.month !== month || found.day !== 1) throw new RangeError('Дата вне диапазона календаря')
  return low
}

export function daysInCalendarMonth(year: number, month: number, calendar: CalendarKind): number {
  return monthStart(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, calendar) - monthStart(year, month, calendar)
}

export function civilDateFromCalendar({ year, month, day }: CalendarDate, calendar: CalendarKind, correction: DateCorrection = 0): string {
  const clampedDay = Math.max(1, Math.min(day, daysInCalendarMonth(year, month, calendar)))
  const offset = calendar === 'hijri' ? correction : 0
  return new Date((monthStart(year, month, calendar) + clampedDay - 1 - offset) * DAY_MS).toISOString().slice(0, 10)
}

export function formatCalendarDate(date: string, { calendar, correction }: CalendarPreferences): string {
  if (calendar === 'gregorian') return formatCompactDateLabel(date)
  const parts = calendarDateFromCivil(date, calendar, correction)
  return `${parts.day} ${COMPACT_HIJRI_MONTHS[parts.month - 1]}`
}
