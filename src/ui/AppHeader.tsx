import type {
  ChangeEventHandler,
  MouseEventHandler,
  RefObject,
} from 'react'

import {
  addDays,
  formatCompactDateLabel,
  formatDateLabel,
} from '../domain/date'
import type { PrayerLocation } from '../domain/types'
import {
  ChevronIcon,
  LocationIcon,
  SettingsIcon,
} from './Icons'

interface AppHeaderProps {
  locationButtonRef: RefObject<HTMLButtonElement | null>
  settingsButtonRef: RefObject<HTMLButtonElement | null>
  officialMode: boolean
  selectedLocation: PrayerLocation | undefined
  calculatedLocationLabel: string
  selectedDate: string
  today: string
  minDate: string | undefined
  maxDate: string | undefined
  onOpenLocation: () => void
  onOpenSettings: () => void
  onChangeDate: (date: string) => void
  onDateInput: ChangeEventHandler<HTMLInputElement>
  onShowDatePicker: MouseEventHandler<HTMLInputElement>
}

export function AppHeader({
  locationButtonRef,
  settingsButtonRef,
  officialMode,
  selectedLocation,
  calculatedLocationLabel,
  selectedDate,
  today,
  minDate,
  maxDate,
  onOpenLocation,
  onOpenSettings,
  onChangeDate,
  onDateInput,
  onShowDatePicker,
}: AppHeaderProps) {
  return (
    <header className="app-header">
      <span className="spark spark-left" aria-hidden="true">✦</span>
      <h1 className="brand">Salah</h1>
      <span className="spark spark-right" aria-hidden="true">✧</span>

      <div className="control-row">
        <div className="location-tools">
          <button
            ref={locationButtonRef}
            className="location-control"
            type="button"
            onClick={onOpenLocation}
            aria-label={officialMode
              ? `Населённый пункт: ${selectedLocation?.name ?? 'не выбран'}`
              : `Местоположение: ${calculatedLocationLabel}`}
          >
            <LocationIcon />
            <span>{officialMode ? selectedLocation?.name ?? 'Выберите населённый пункт' : calculatedLocationLabel}</span>
            <ChevronIcon className="location-chevron" />
          </button>
          <button
            ref={settingsButtonRef}
            className="icon-button settings-button"
            type="button"
            aria-label="Настройки автономного расчёта"
            onClick={onOpenSettings}
          >
            <SettingsIcon />
          </button>
        </div>

        <div className="date-controls">
          <button
            className="icon-button date-arrow"
            type="button"
            aria-label="Предыдущий день"
            disabled={Boolean(minDate && selectedDate <= minDate)}
            onClick={() => onChangeDate(addDays(selectedDate, -1))}
          >
            <ChevronIcon direction="left" />
          </button>

          <label className="date-picker">
            <span className="date-label-full">{formatDateLabel(selectedDate)}</span>
            <span className="date-label-compact" aria-hidden="true">{formatCompactDateLabel(selectedDate)}</span>
            <input
              aria-label="Выбрать дату"
              type="date"
              min={minDate}
              max={maxDate}
              value={selectedDate}
              onClick={onShowDatePicker}
              onChange={onDateInput}
            />
          </label>

          <button
            className="icon-button date-arrow"
            type="button"
            aria-label="Следующий день"
            disabled={Boolean(maxDate && selectedDate >= maxDate)}
            onClick={() => onChangeDate(addDays(selectedDate, 1))}
          >
            <ChevronIcon />
          </button>

          {selectedDate !== today ? (
            <button className="today-button" type="button" onClick={() => onChangeDate(today)}>Сегодня</button>
          ) : null}
        </div>
      </div>
    </header>
  )
}
