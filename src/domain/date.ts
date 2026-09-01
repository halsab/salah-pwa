const MOSCOW_TIME_ZONE = 'Europe/Moscow'
const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})
const COMPACT_DATE_LABEL_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
})

function toUtcDate(date: string): Date {
  return new Date(`${date}T12:00:00.000Z`)
}

export function getMoscowDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MOSCOW_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))

  return `${values.year}-${values.month}-${values.day}`
}

export function addDays(date: string, amount: number): string {
  const instant = new Date(`${date}T12:00:00.000Z`)
  instant.setUTCDate(instant.getUTCDate() + amount)
  return instant.toISOString().slice(0, 10)
}

export function formatDateLabel(date: string): string {
  return DATE_LABEL_FORMATTER.format(toUtcDate(date))
}

export function formatCompactDateLabel(date: string): string {
  return COMPACT_DATE_LABEL_FORMATTER.format(toUtcDate(date))
}
