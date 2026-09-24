import { useMemo } from 'react'

import {
  calendarDateFromCivil,
  civilDateFromCalendar,
  type DateCorrection,
} from '../../domain/calendar'
import {
  listReligiousEventOccurrences,
  type ReligiousEventId,
  type ReligiousEventOccurrence,
} from '../../domain/religiousEvents'
import { BackButton, Screen } from '../../ui/Screen'
import { formatReligiousEventOccurrenceDate } from './religiousEventDate'

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
