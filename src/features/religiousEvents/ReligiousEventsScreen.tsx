import { useMemo } from 'react'

import {
  calendarDateFromCivil,
  civilDateFromCalendar,
  HIJRI_MONTHS,
  type DateCorrection,
} from '../../domain/calendar'
import { addDays } from '../../domain/date'
import {
  listReligiousEventOccurrences,
  type ReligiousEventId,
  type ReligiousEventOccurrence,
} from '../../domain/religiousEvents'
import { BackButton, Screen } from '../../ui/Screen'

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

export function ReligiousEventOccurrenceRow({ occurrence, onOpenEvent }: {
  occurrence: ReligiousEventOccurrence
  onOpenEvent: (eventId: ReligiousEventId) => void
}) {
  const id = `religious-event-${occurrence.civilDate}-${occurrence.eventId}`
  const contentId = occurrence.contentId
  const content = <>
    <span className="religious-event-banner-title">{occurrence.title}</span>
    <span className="religious-event-banner-secondary">{formatReligiousEventOccurrenceDate(occurrence)}</span>
  </>
  return <li>
    {contentId
      ? <button id={id} className="religious-event-list-row" type="button" onClick={() => onOpenEvent(contentId)}>{content}</button>
      : <div id={id} className="religious-event-list-row">{content}</div>}
  </li>
}

export function ReligiousEventsScreen({ today, correction, hijriSupported, onOpenEvent, onBack }: {
  today: string
  correction: DateCorrection
  hijriSupported: boolean
  onOpenEvent: (eventId: ReligiousEventId) => void
  onBack: () => void
}) {
  const occurrences = useMemo(() => {
    const start = calendarDateFromCivil(today, 'gregorian')
    const toDateExclusive = civilDateFromCalendar({ ...start, year: start.year + 1 }, 'gregorian')
    return listReligiousEventOccurrences({ fromDate: today, toDateExclusive, correction, hijriSupported })
  }, [today, correction, hijriSupported])

  return <Screen label="Праздники и события" top={<BackButton onClick={onBack} />}>
    <ul className="religious-events-list">
      {occurrences.map(occurrence => <ReligiousEventOccurrenceRow
        key={`${occurrence.civilDate}:${occurrence.eventId}`}
        occurrence={occurrence}
        onOpenEvent={onOpenEvent}
      />)}
    </ul>
  </Screen>
}
