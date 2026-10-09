import type { SupportedLocale } from './locale'

export function interpolate(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (_, key: string) => String(params[key] ?? `{${key}}`))
}

export function pluralCategory(count: number, forms: Partial<Record<Intl.LDMLPluralRule, string>>): string {
  const category = new Intl.PluralRules('ru-RU').select(Math.abs(count))
  return forms[category] ?? forms.other ?? ''
}

export function formatNumber(value: number, locale: SupportedLocale = 'ru', options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(locale, options).format(value)
}

export function formatClockTime(instant: number | Date, timeZone: string, locale: SupportedLocale = 'ru'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(typeof instant === 'number' ? new Date(instant) : instant)
}

export function formatDateTime(instant: number | Date, timeZone: string, locale: SupportedLocale = 'ru'): string {
  return new Intl.DateTimeFormat(locale, {
    calendar: 'gregory', timeZone, dateStyle: 'short', timeStyle: 'short',
  }).format(typeof instant === 'number' ? new Date(instant) : instant)
}

export function formatCivilDate(date: string, locale: SupportedLocale = 'ru'): string {
  return new Intl.DateTimeFormat(locale, {
    calendar: 'gregory', timeZone: 'UTC', day: 'numeric', month: 'long',
  }).format(new Date(`${date}T12:00:00.000Z`))
}

export function formatLocaleDate(date: string, locale: string = 'ru', options: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat(locale, { ...options, calendar: 'gregory', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00.000Z`))
}
