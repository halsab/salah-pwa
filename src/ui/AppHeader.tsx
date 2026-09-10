import type { ChangeEventHandler, MouseEventHandler, RefObject } from 'react'
import { formatCompactDateLabel } from '../domain/date'

export function AppHeader({ locationButtonRef, locationLabel, selectedDate, onOpenLocation, onDateInput, onShowDatePicker }: {
  locationButtonRef: RefObject<HTMLButtonElement | null>
  locationLabel: string
  selectedDate: string
  onOpenLocation: () => void
  onDateInput: ChangeEventHandler<HTMLInputElement>
  onShowDatePicker: MouseEventHandler<HTMLInputElement>
}) {
  return <>
    <button ref={locationButtonRef} id="home-location" className="pill home-location" type="button" onClick={onOpenLocation}>{locationLabel}</button>
    <label className="pill native-date"><span>{formatCompactDateLabel(selectedDate)}</span>
      <input aria-label="Выбрать дату" type="date" value={selectedDate} onClick={onShowDatePicker} onChange={onDateInput} />
    </label>
  </>
}
