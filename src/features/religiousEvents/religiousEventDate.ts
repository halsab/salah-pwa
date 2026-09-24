import { HIJRI_MONTHS } from '../../domain/calendar'
import { addDays } from '../../domain/date'
import type { ReligiousEventOccurrence } from '../../domain/religiousEvents'

const GREGORIAN_DATE_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

interface GregorianDisplayParts {
  day: string
  month: string
  year: string
}

function gregorianDisplayParts(date: string): GregorianDisplayParts {
  const parts = GREGORIAN_DATE_FORMATTER.formatToParts(new Date(`${date}T12:00:00Z`))
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? ''
  return { day: value('day'), month: value('month'), year: value('year') }
}

function formatGregorianDate(date: string): string {
  const { day, month, year } = gregorianDisplayParts(date)
  return `${day} ${month} ${year}`
}

function formatGregorianNightRange(targetDate: string): string {
  const previous = gregorianDisplayParts(addDays(targetDate, -1))
  const target = gregorianDisplayParts(targetDate)
  if (previous.year !== target.year) {
    return `${previous.day} ${previous.month} ${previous.year} – ${target.day} ${target.month} ${target.year}`
  }
  if (previous.month !== target.month) {
    return `${previous.day} ${previous.month} – ${target.day} ${target.month} ${target.year}`
  }
  return `${previous.day}–${target.day} ${target.month} ${target.year}`
}

export function formatReligiousEventOccurrenceDate(occurrence: ReligiousEventOccurrence): string {
  const gregorian = occurrence.kind === 'night'
    ? formatGregorianNightRange(occurrence.civilDate)
    : formatGregorianDate(occurrence.civilDate)
  const hijri = `${occurrence.hijriDate.day} ${HIJRI_MONTHS[occurrence.hijriDate.month - 1]} ${occurrence.hijriDate.year}`
  return `${gregorian} · ${hijri}`
}
