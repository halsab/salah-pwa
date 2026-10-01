import type { RefObject } from 'react'
import { formatCalendarDate, type CalendarPreferences } from '../domain/calendar'
import { ActionButton } from './controls'

export function AppHeader({ locationButtonRef, locationLabel, locationTime, selectedDate, calendarPreferences, onOpenLocation, onOpenDate }: {
  locationButtonRef: RefObject<HTMLButtonElement | null>
  locationLabel: string
  locationTime?: string | undefined
  selectedDate: string
  calendarPreferences: CalendarPreferences
  onOpenLocation: () => void
  onOpenDate: () => void
}) {
  return <>
    <ActionButton ref={locationButtonRef} id="home-location" className="home-location" onClick={onOpenLocation}
      aria-label={locationTime ? `${locationLabel} ${locationTime}` : undefined}>
      <span className="home-location-name">{locationLabel}</span>
      {locationTime ? <span className="home-location-time">{locationTime}</span> : null}
    </ActionButton>
    <ActionButton id="home-date" aria-label="Выбрать дату" aria-describedby="home-date-value" onClick={onOpenDate}>
      <time id="home-date-value" dateTime={selectedDate}>{formatCalendarDate(selectedDate, calendarPreferences)}</time>
    </ActionButton>
  </>
}
