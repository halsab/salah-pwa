import { useEffect, useMemo, useState } from 'react'

import { addDays } from '../../domain/date'
import {
  UnsupportedCalculationProfileError,
  calculatePrayerSchedule,
} from '../../domain/prayerCalculation'
import { scheduleContextKey, type ScheduleContext } from '../../domain/scheduleContext'
import { buildScheduleEvents, type PrayerSchedule } from '../../domain/scheduleEvents'
import type { PrayerDay } from '../../domain/types'
import type { Place } from '../../domain/place'
import type { ResolvedPrayerSource } from '../../domain/prayerSource'
import { isPrayerDay } from '../../domain/prayerDatasetValidation'

export type DisplaySchedule = PrayerSchedule

interface PrayerScheduleServices {
  getDays: (locationId: string, dates: readonly string[], datasetRevision: string) => Promise<(PrayerDay | undefined)[]>
}

interface UsePrayerSchedulesOptions {
  services: PrayerScheduleServices
  location: Place | null
  resolution: ResolvedPrayerSource | null
  mode: 'automatic' | 'manual'
  selectedDate: string
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
  services, location, resolution, mode, selectedDate,
}: UsePrayerSchedulesOptions) {
  const latitude = location?.latitude
  const longitude = location?.longitude
  const id = location?.id ?? null
  const description: ScheduleContext | null = resolution?.status === 'ready' && latitude !== undefined && longitude !== undefined
    ? resolution.kind === 'official' && resolution.revision && resolution.version && resolution.coverage && resolution.locationId
      ? { location: { id, latitude, longitude }, date: selectedDate, timeZone: resolution.timeZone, mode,
        source: 'official', provider: resolution.provider, datasetRevision: resolution.revision,
        datasetVersion: resolution.version, coverage: resolution.coverage, localityId: resolution.locationId }
      : resolution.kind === 'calculated'
        ? { location: { id, latitude, longitude }, date: selectedDate, timeZone: resolution.timeZone, mode, source: 'calculated', settings: resolution.settings }
        : null
    : null
  const serialized = description ? JSON.stringify(description) : null
  const context = useMemo<ScheduleContext | null>(() => serialized ? JSON.parse(serialized) as ScheduleContext : null, [serialized])
  const key = context ? scheduleContextKey(context) : null
  const [result, setResult] = useState<ScheduleResult | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!context || !key) return
    let active = true
    const load = async (): Promise<DisplaySchedule[]> => {
      // При offsets [-3, 3] с поправками нужны даты [D-4, D+4], чтобы сохранить и соседний день с каждой стороны.
      const radius = context.source === 'calculated' ? 4 : 1
      const dates = Array.from({ length: radius * 2 + 1 }, (_, index) => addDays(context.date, index - radius))
      if (context.source === 'official') {
        const days = await services.getDays(context.localityId, dates, context.datasetRevision)
        if (days.length !== dates.length || days.some((day, index) => day && (
          !isPrayerDay(day) || day.date !== dates[index] || day.locationId !== context.localityId
        ))) throw new Error('Набор дней не соответствует запросу')
        if (!days.some(day => day?.date === context.date)) throw new Error('Не найден день покрытого расписания')
        return days.filter((day) => day !== undefined)
      }
      const days = dates.map((date) => calculatePrayerSchedule(context.location, date, context.timeZone, context.settings))
      if (days.flatMap(buildScheduleEvents).some((event) => Math.abs(event.dayOffset) > 3)) {
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
  const unavailable = resolution && resolution.status !== 'ready'
    ? resolution.kind === 'calculated' ? 'Выбранный расчётный профиль недоступен в этом браузере.'
      : resolution.status === 'not-covered' ? 'Выбранный официальный источник не покрывает это место или дату. Выберите другой источник или автоматический режим.'
        : resolution.status === 'invalid' ? 'Официальное расписание повреждено. Повторите загрузку.'
          : 'Официальное расписание ещё не загружено. Подключитесь к сети и повторите загрузку.'
    : null
  return {
    context,
    contextKey: key,
    schedules,
    schedule: schedules.find(({ date }) => date === selectedDate) ?? null,
    previousSchedule: schedules.find(({ date }) => date === addDays(selectedDate, -1)),
    tomorrow: schedules.find(({ date }) => date === addDays(selectedDate, 1)),
    scheduleLoading: !matching && !unavailable,
    scheduleError: unavailable ?? matching?.error ?? null,
    retrySchedule: () => setRetry((count) => count + 1),
  }
}
