import { getCivilDate, getDeviceTimeZone } from './locationTime'
import { formatLocaleDate } from '../localization/formatters'
import type { SupportedLocale } from '../localization/locale'

export function getSystemDate(now: Date, timeZone = getDeviceTimeZone()): string {
  return getCivilDate(now, timeZone)
}

export function addDays(date: string, amount: number): string {
  const instant = new Date(`${date}T12:00:00.000Z`)
  instant.setUTCDate(instant.getUTCDate() + amount)
  return instant.toISOString().slice(0, 10)
}

export function formatDateLabel(date: string, locale: SupportedLocale = 'ru'): string {
  return formatLocaleDate(date, locale, { weekday: 'long', day: 'numeric', month: 'long' })
}

export function formatCompactDateLabel(date: string, locale: SupportedLocale = 'ru'): string {
  return formatLocaleDate(date, locale, { day: 'numeric', month: 'long' })
}
