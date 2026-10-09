import {
  calendarDateFromCivil,
  type CalendarKind,
  type CalendarPreferences,
} from '../domain/calendar'
import { formatLocaleDate } from './formatters'
import { translate, type MessageKey, type Translator } from './messages'
import type { SupportedLocale } from './locale'

const GREGORIAN_MONTH_KEYS = [
  'monthJanuary', 'monthFebruary', 'monthMarch', 'monthApril', 'monthMay', 'monthJune',
  'monthJuly', 'monthAugust', 'monthSeptember', 'monthOctober', 'monthNovember', 'monthDecember',
] as const satisfies readonly MessageKey[]

const HIJRI_MONTH_KEYS = [
  'hijriMuharram', 'hijriSafar', 'hijriRabiAlAwwal', 'hijriRabiAthThani', 'hijriJumadaAlUla',
  'hijriJumadaAthThani', 'hijriRajab', 'hijriShaban', 'hijriRamadan', 'hijriShawwal',
  'hijriDhulQadah', 'hijriDhulHijjah',
] as const satisfies readonly MessageKey[]

const COMPACT_HIJRI_MONTH_KEYS = [
  'hijriMuharram', 'hijriSafar', 'compactHijriRabiAlAwwal', 'compactHijriRabiAthThani',
  'compactHijriJumadaAlUla', 'compactHijriJumadaAthThani', 'hijriRajab', 'hijriShaban',
  'hijriRamadan', 'hijriShawwal', 'hijriDhulQadah', 'hijriDhulHijjah',
] as const satisfies readonly MessageKey[]

export function calendarMonthLabels(t: Translator, calendar: CalendarKind): string[] {
  const keys = calendar === 'hijri' ? HIJRI_MONTH_KEYS : GREGORIAN_MONTH_KEYS
  return keys.map(key => t(key))
}

export function formatLocalizedCalendarDate(
  date: string,
  preferences: CalendarPreferences,
  locale: SupportedLocale = 'ru',
): string {
  if (preferences.calendar === 'gregorian') {
    return formatLocaleDate(date, locale, { day: 'numeric', month: 'long' })
  }
  const parts = calendarDateFromCivil(date, 'hijri', preferences.correction)
  const monthKey = COMPACT_HIJRI_MONTH_KEYS[parts.month - 1]
  return monthKey ? `${parts.day} ${translate(locale, monthKey)}` : String(parts.day)
}

export function formatLocalizedGregorianDate(
  date: string,
  locale: string = 'ru',
): string {
  const parts = new Intl.DateTimeFormat(locale, {
    calendar: 'gregory', timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric',
  }).formatToParts(new Date(`${date}T12:00:00.000Z`))
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? ''
  return `${value('day')} ${value('month')} ${value('year')}`
}

export function formatLocalizedGregorianNightRange(
  targetDate: string,
  previousDate: string,
  locale: string = 'ru',
): string {
  const dateParts = (date: string) => {
    const parts = new Intl.DateTimeFormat(locale, {
      calendar: 'gregory', timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric',
    }).formatToParts(new Date(`${date}T12:00:00.000Z`))
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? ''
    return { day: value('day'), month: value('month'), year: value('year') }
  }
  const previous = dateParts(previousDate)
  const target = dateParts(targetDate)
  if (previous.year !== target.year) return `${previous.day} ${previous.month} ${previous.year} – ${target.day} ${target.month} ${target.year}`
  if (previous.month !== target.month) return `${previous.day} ${previous.month} – ${target.day} ${target.month} ${target.year}`
  return `${previous.day}–${target.day} ${target.month} ${target.year}`
}

export function formatLocalizedHijriMonth(
  month: number,
  locale: SupportedLocale = 'ru',
  compact = false,
): string {
  const keys = compact ? COMPACT_HIJRI_MONTH_KEYS : HIJRI_MONTH_KEYS
  const key = keys[month - 1]
  return key ? translate(locale, key) : ''
}
