import { useEffect, useMemo, useState } from 'react'

import { addDays } from '../../domain/date'
import {
  UnsupportedCalculationProfileError,
  calculatePrayerSchedule,
} from '../../domain/prayerCalculation'
import { scheduleContextKey, type ScheduleContext } from '../../domain/scheduleContext'
import { verifiedTatarstanLocalityId } from '../../domain/tatarstanDhuhr'
import { buildScheduleEvents, type PrayerSchedule } from '../../domain/scheduleEvents'
import type { Place } from '../../domain/place'
import type { ResolvedPrayerSource } from '../../domain/prayerSource'
import type { CalculationProfileId } from '../../domain/prayerCalculation'
import type { FastScheduleStartup } from './fastScheduleSnapshot'

export type DisplaySchedule = PrayerSchedule

export type ScheduleError =
  | { code: 'load-failed' }
  | { code: 'unsupported-profile'; profile: CalculationProfileId }

interface UsePrayerSchedulesOptions {
  location: Place | null
  resolution: ResolvedPrayerSource | null
  mode: 'automatic' | 'manual'
  selectedDate: string
  initialSnapshot?: FastScheduleStartup | null
}

interface ScheduleResult {
  context: ScheduleContext
  key: string
  retry: number
  enrichmentRetry: number
  schedules: DisplaySchedule[]
  contextReady: boolean
  enrichmentError: boolean
}

function scheduleError(error: unknown): ScheduleError {
  return error instanceof UnsupportedCalculationProfileError
    ? { code: 'unsupported-profile', profile: error.profile }
    : { code: 'load-failed' }
}

export function usePrayerSchedules({ location, resolution, mode, selectedDate, initialSnapshot }: UsePrayerSchedulesOptions) {
  const latitude = location?.latitude
  const longitude = location?.longitude
  const id = location?.id ?? null
  const localityId = location && resolution?.settings.profile === 'tatarstan'
    ? verifiedTatarstanLocalityId(location)
    : undefined
  const description: ScheduleContext | null = resolution?.status === 'ready' && latitude !== undefined && longitude !== undefined
    ? { location: { id, latitude, longitude, ...(localityId ? { localityId } : {}) }, date: selectedDate,
      timeZone: resolution.timeZone, mode, source: 'calculated', settings: resolution.settings }
    : null
  const serialized = description ? JSON.stringify(description) : null
  const context = useMemo<ScheduleContext | null>(() => serialized ? JSON.parse(serialized) as ScheduleContext : null, [serialized])
  const key = context ? scheduleContextKey(context) : null
  const [result, setResult] = useState<ScheduleResult | null>(() => initialSnapshot
    ? { context: initialSnapshot.context, key: scheduleContextKey(initialSnapshot.context), retry: 0, enrichmentRetry: 0,
      schedules: [initialSnapshot.schedule], contextReady: false, enrichmentError: false }
    : null)
  const [retry, setRetry] = useState(0)
  const [enrichmentRetry, setEnrichmentRetry] = useState(0)

  const matching = result?.key === key && result.retry === retry && result.enrichmentRetry === enrichmentRetry ? result : null
  const selectedComputation = useMemo((): { schedule: DisplaySchedule | null; error: ScheduleError | null } => {
    if (!context || !key) return { schedule: null, error: null }
    const stored = matching?.schedules.find(day => day.date === context.date)
    if (stored) return { schedule: stored, error: null }
    if (initialSnapshot && retry === 0 && scheduleContextKey(initialSnapshot.context) === key) {
      return { schedule: initialSnapshot.schedule, error: null }
    }
    try {
      return { schedule: calculatePrayerSchedule(context.location, context.date, context.timeZone, context.settings), error: null }
    } catch (error) {
      return { schedule: null, error: scheduleError(error) }
    }
  }, [context, initialSnapshot, key, matching, retry])

  useEffect(() => {
    if (!context || !key || !selectedComputation.schedule) return
    let active = true
    const selectedSchedule = selectedComputation.schedule

    const enrich = async () => {
      try {
        // Даём браузеру показать выбранный день до вычисления соседних суток.
        await new Promise<void>(resolve => window.setTimeout(resolve, 0))
        if (!active) return
        const radius = 4
        const dates = Array.from({ length: radius * 2 + 1 }, (_, index) => addDays(context.date, index - radius))
        const schedules = dates.map(date => date === selectedSchedule.date ? selectedSchedule
          : calculatePrayerSchedule(context.location, date, context.timeZone, context.settings))
        if (schedules.flatMap(buildScheduleEvents).some(event => Math.abs(event.dayOffset) > 3)) {
          throw new Error('schedule-event-outside-window')
        }
        setResult({ context, key, retry, enrichmentRetry, schedules, contextReady: true, enrichmentError: false })
      } catch {
        setResult({ context, key, retry, enrichmentRetry, schedules: [selectedSchedule],
          contextReady: false, enrichmentError: true })
      }
    }

    void enrich()
    return () => { active = false }
  }, [context, enrichmentRetry, key, retry, selectedComputation.schedule])

  // Проверка во время render закрывает промежуток до cleanup/effect нового запроса.
  const currentResult = result?.key === key && result.retry === retry && result.enrichmentRetry === enrichmentRetry ? result : null
  const schedules = currentResult?.schedules ?? (selectedComputation.schedule ? [selectedComputation.schedule] : [])
  const unavailable: ScheduleError | null = resolution?.status === 'unsupported'
    ? { code: 'unsupported-profile', profile: resolution.settings.profile }
    : null
  return {
    context,
    contextKey: key,
    schedules,
    schedule: schedules.find(({ date }) => date === selectedDate) ?? null,
    previousSchedule: schedules.find(({ date }) => date === addDays(selectedDate, -1)),
    tomorrow: schedules.find(({ date }) => date === addDays(selectedDate, 1)),
    scheduleLoading: !currentResult && !selectedComputation.schedule && !selectedComputation.error && !unavailable,
    scheduleError: unavailable ?? selectedComputation.error,
    contextReady: Boolean(currentResult?.contextReady),
    enrichmentError: Boolean(currentResult?.enrichmentError),
    retrySchedule: () => setRetry(count => count + 1),
    retryEnrichment: () => setEnrichmentRetry(count => count + 1),
  }
}
