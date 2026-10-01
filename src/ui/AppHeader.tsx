import type { RefObject } from 'react'
import { formatCalendarDate, type CalendarPreferences } from '../domain/calendar'
import { Button } from './controls'

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
    <Button ref={locationButtonRef} id="home-location" className="home-location" onClick={onOpenLocation}
      aria-label={locationTime ? `${locationLabel} ${locationTime}` : undefined}>
      <span className="home-location-name">{locationLabel}</span>
      {locationTime ? <span className="home-location-time">{locationTime}</span> : null}
    </Button>
    <Button id="home-date" aria-label="Выбрать дату" aria-describedby="home-date-value" onClick={onOpenDate}>
      <time id="home-date-value" dateTime={selectedDate}>{formatCalendarDate(selectedDate, calendarPreferences)}</time>
    </Button>
  </>
}
