import type { RefObject } from 'react'
import { formatCalendarDate, type CalendarPreferences } from '../domain/calendar'

export function AppHeader({ locationButtonRef, locationLabel, selectedDate, calendarPreferences, onOpenLocation, onOpenDate }: {
  locationButtonRef: RefObject<HTMLButtonElement | null>
  locationLabel: string
  selectedDate: string
  calendarPreferences: CalendarPreferences
  onOpenLocation: () => void
  onOpenDate: () => void
}) {
  return <>
    <button ref={locationButtonRef} id="home-location" className="pill home-location" type="button" onClick={onOpenLocation}>{locationLabel}</button>
    <button id="home-date" className="pill" type="button" aria-label="Выбрать дату" aria-describedby="home-date-value" onClick={onOpenDate}>
      <time id="home-date-value" dateTime={selectedDate}>{formatCalendarDate(selectedDate, calendarPreferences)}</time>
    </button>
  </>
}
