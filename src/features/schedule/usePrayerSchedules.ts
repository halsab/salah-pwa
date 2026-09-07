import { useEffect, useMemo, useState } from 'react'

import { addDays } from '../../domain/date'
import {
  UnsupportedCalculationProfileError,
  calculatePrayerSchedule,
  type CalculationSettings,
} from '../../domain/prayerCalculation'
import { getDatasetRevision, scheduleContextKey, type ScheduleContext } from '../../domain/scheduleContext'
import { buildScheduleEvents, type PrayerSchedule } from '../../domain/scheduleEvents'
import type { PrayerDay, SavedCoordinates } from '../../domain/types'
import type { DatasetMeta, LocationMode } from '../../storage/database'

export type DisplaySchedule = PrayerSchedule

interface PrayerScheduleServices {
  getDays: (locationId: string, dates: readonly string[], datasetRevision: string) => Promise<(PrayerDay | undefined)[]>
}

interface UsePrayerSchedulesOptions {
  services: PrayerScheduleServices
  meta: DatasetMeta | null
  locationId: string
  locationMode: LocationMode
  calculatedLocation: SavedCoordinates | null
  calculationSettings: CalculationSettings
  selectedDate: string
  timeZone: string
}

interface ScheduleResult {
  context: ScheduleContext
  key: string
  retry: number
  services: PrayerScheduleServices
  schedules: DisplaySchedule[]
  error: string | null
}

export function usePrayerSchedules({
  services, meta, locationId, locationMode, calculatedLocation,
  calculationSettings, selectedDate, timeZone,
}: UsePrayerSchedulesOptions) {
  const official = locationMode === 'official'
  const location = official ? meta?.locations.find(({ id }) => id === locationId) : calculatedLocation
  const id = official ? locationId : calculatedLocation?.cityId?.toString() ?? null
  const latitude = location?.latitude
  const longitude = location?.longitude
  const datasetRevision = official && meta ? getDatasetRevision(meta) : null
  const profile = official ? null : calculationSettings.profile
  const asrMethod = official ? null : calculationSettings.asrMethod
  const highLatitudeRule = official ? null : calculationSettings.highLatitudeRule
  const context = useMemo<ScheduleContext | null>(() => {
    if (latitude === undefined || longitude === undefined) return null
    const base = { location: { id, latitude, longitude }, date: selectedDate, timeZone }
    if (official && datasetRevision) return { ...base, source: 'dumRt', datasetRevision }
    if (!official && profile && asrMethod && highLatitudeRule) {
      return { ...base, source: 'adhan', settings: { profile, asrMethod, highLatitudeRule } }
    }
    return null
  }, [id, latitude, longitude, selectedDate, timeZone, official, datasetRevision, profile, asrMethod, highLatitudeRule])
  const key = context ? scheduleContextKey(context) : null
  const [result, setResult] = useState<ScheduleResult | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!context || !key) return
    let active = true
    const load = async (): Promise<DisplaySchedule[]> => {
      // При offsets [-2, 2] нужны даты [D-3, D+3], чтобы сохранить и соседний день с каждой стороны.
      const radius = context.source === 'adhan' ? 3 : 1
      const dates = Array.from({ length: radius * 2 + 1 }, (_, index) => addDays(context.date, index - radius))
      if (context.source === 'dumRt') {
        if (context.location.id === null) throw new Error('Не указан населённый пункт')
        const days = await services.getDays(context.location.id, dates, context.datasetRevision)
        if (days.length !== dates.length || days.some((day, index) => day && (
          day.date !== dates[index] || day.locationId !== context.location.id
        ))) throw new Error('Набор дней не соответствует запросу')
        return days.filter((day) => day !== undefined)
      }
      const days = dates.map((date) => calculatePrayerSchedule(context.location, date, context.timeZone, context.settings))
      if (days.flatMap(buildScheduleEvents).some((event) => event.dayOffset !== null && Math.abs(event.dayOffset) > 2)) {
        throw new Error('Событие вне поддерживаемого окна календарных дат')
      }
      return days
    }
    void load().then((schedules) => {
      if (active) setResult({ context, key, retry, services, schedules, error: null })
    }).catch((error: unknown) => {
      if (active) setResult({ context, key, retry, services, schedules: [], error:
        error instanceof UnsupportedCalculationProfileError
          ? error.message
          : 'Не удалось загрузить расписание. Попробуйте ещё раз.',
      })
    })
    return () => { active = false }
  }, [context, key, retry, services])

  // Проверка во время render закрывает промежуток до cleanup/effect нового запроса.
  const matching = result?.key === key && result.retry === retry && result.services === services ? result : null
  const schedules = matching?.schedules ?? []
  return {
    context,
    contextKey: key,
    schedules,
    schedule: schedules.find(({ date }) => date === selectedDate) ?? null,
    previousSchedule: schedules.find(({ date }) => date === addDays(selectedDate, -1)),
    tomorrow: schedules.find(({ date }) => date === addDays(selectedDate, 1)),
    scheduleLoading: !matching,
    scheduleError: matching?.error ?? null,
    retrySchedule: () => setRetry((count) => count + 1),
  }
}
