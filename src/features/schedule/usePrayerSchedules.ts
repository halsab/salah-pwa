import { useEffect, useState } from 'react'

import { addDays } from '../../domain/date'
import {
  calculatePrayerSchedule,
  type CalculationSettings,
  type CalculatedPrayerSchedule,
} from '../../domain/prayerCalculation'
import type { PrayerDay, SavedCoordinates } from '../../domain/types'
import type { DatasetMeta, LocationMode } from '../../storage/database'

export type DisplaySchedule = PrayerDay | CalculatedPrayerSchedule

interface PrayerScheduleServices {
  getDay: (locationId: string, date: string) => Promise<PrayerDay | undefined>
}

interface UsePrayerSchedulesOptions {
  services: PrayerScheduleServices
  meta: DatasetMeta | null
  locationId: string
  locationMode: LocationMode
  calculatedLocation: SavedCoordinates | null
  calculationSettings: CalculationSettings
  selectedDate: string
}

export function usePrayerSchedules({
  services,
  meta,
  locationId,
  locationMode,
  calculatedLocation,
  calculationSettings,
  selectedDate,
}: UsePrayerSchedulesOptions) {
  const [schedule, setSchedule] = useState<DisplaySchedule | null>(null)
  const [previousSchedule, setPreviousSchedule] = useState<DisplaySchedule | undefined>()
  const [tomorrow, setTomorrow] = useState<DisplaySchedule | undefined>()
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [scheduleRetryCount, setScheduleRetryCount] = useState(0)

  useEffect(() => {
    if (!meta) return
    let active = true
    setScheduleLoading(true)
    setScheduleError(null)

    const loadSchedules = async (): Promise<[
      DisplaySchedule | undefined,
      DisplaySchedule | null,
      DisplaySchedule | undefined,
    ]> => {
      if (locationMode === 'calculated' && calculatedLocation) {
        return [
          calculatePrayerSchedule(calculatedLocation, addDays(selectedDate, -1), calculationSettings),
          calculatePrayerSchedule(calculatedLocation, selectedDate, calculationSettings),
          calculatePrayerSchedule(calculatedLocation, addDays(selectedDate, 1), calculationSettings),
        ]
      }
      const [officialPrevious, officialDay, officialTomorrow] = await Promise.all([
        services.getDay(locationId, addDays(selectedDate, -1)),
        services.getDay(locationId, selectedDate),
        services.getDay(locationId, addDays(selectedDate, 1)),
      ])
      return [officialPrevious, officialDay ?? null, officialTomorrow]
    }

    void loadSchedules().then(([loadedPrevious, loadedSchedule, loadedTomorrow]) => {
      if (!active) return
      setPreviousSchedule(loadedPrevious)
      setSchedule(loadedSchedule)
      setTomorrow(loadedTomorrow)
    }).catch(() => {
      if (!active) return
      setPreviousSchedule(undefined)
      setSchedule(null)
      setTomorrow(undefined)
      setScheduleError('Не удалось загрузить расписание. Попробуйте ещё раз.')
    }).finally(() => {
      if (active) setScheduleLoading(false)
    })
    return () => { active = false }
  }, [
    calculatedLocation,
    calculationSettings.asrMethod,
    calculationSettings.highLatitudeRule,
    calculationSettings.profile,
    locationId,
    locationMode,
    meta,
    scheduleRetryCount,
    selectedDate,
    services,
  ])

  return {
    schedule,
    previousSchedule,
    tomorrow,
    scheduleLoading,
    scheduleError,
    retrySchedule: () => setScheduleRetryCount((count) => count + 1),
  }
}
