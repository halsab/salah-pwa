import { useEffect, useMemo, useRef, useState } from 'react'

import { addDays } from '../../domain/date'
import {
  UnsupportedCalculationProfileError,
  calculatePrayerSchedule,
} from '../../domain/prayerCalculation'
import { scheduleContextKey, type ScheduleContext } from '../../domain/scheduleContext'
import { buildScheduleEvents, type PrayerSchedule } from '../../domain/scheduleEvents'
import type { PrayerDay } from '../../domain/types'
import type { Place } from '../../domain/place'
import { coversOfficialDate, type ResolvedPrayerSource } from '../../domain/prayerSource'
import { isPrayerDay } from '../../domain/prayerDatasetValidation'
import type { CalculationProfileId } from '../../domain/prayerCalculation'
import type { FastScheduleStartup } from './fastScheduleSnapshot'

export type DisplaySchedule = PrayerSchedule

export type ScheduleError =
  | { code: 'load-failed' }
  | { code: 'unsupported-profile'; profile: CalculationProfileId }
  | { code: 'profile-unavailable' }
  | { code: 'source-not-covered' }
  | { code: 'official-invalid' }
  | { code: 'official-not-loaded' }

interface PrayerScheduleServices {
  getDays: (locationId: string, dates: readonly string[], datasetRevision: string, provider: string) => Promise<(PrayerDay | undefined)[]>
}

interface UsePrayerSchedulesOptions {
  services: PrayerScheduleServices
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
  services: PrayerScheduleServices
  schedules: DisplaySchedule[]
  error: ScheduleError | null
  contextReady: boolean
  enrichmentError: boolean
}

export function usePrayerSchedules({
  services, location, resolution, mode, selectedDate, initialSnapshot,
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
  const coverageKey = resolution?.kind === 'official' && resolution.dateCoverage ? JSON.stringify(resolution.dateCoverage) : null
  const dateCoverage = useMemo(() => coverageKey ? JSON.parse(coverageKey) as NonNullable<Extract<ResolvedPrayerSource, { kind: 'official' }>['dateCoverage']> : null, [coverageKey])
  const key = context ? scheduleContextKey(context) : null
  const [result, setResult] = useState<ScheduleResult | null>(() => initialSnapshot
    ? { context: initialSnapshot.context, key: scheduleContextKey(initialSnapshot.context), retry: 0,
      services, schedules: [initialSnapshot.schedule, ...(initialSnapshot.neighbors ?? [])], error: null, contextReady: initialSnapshot.neighbors !== undefined, enrichmentError: false }
    : null)
  const [retry, setRetry] = useState(0)
  const [enrichmentRetry, setEnrichmentRetry] = useState(0)
  const resultRef = useRef(result)

  useEffect(() => {
    if (!context || !key) return
    let active = true
    const currentResult = resultRef.current?.key === key && resultRef.current.retry === retry
      && resultRef.current.services === services ? resultRef.current : null
    const snapshotSelected = initialSnapshot && retry === 0 && scheduleContextKey(initialSnapshot.context) === key
      ? initialSnapshot.schedule : null
    const existingSelected = currentResult?.schedules.find(day => day.date === context.date) ?? null
    const selectedDay = snapshotSelected ?? existingSelected
    const officialDay = (day: PrayerDay | undefined, date: string, locationId: string, timeZone: string): DisplaySchedule | null => {
      if (!day) return null
      if (!isPrayerDay(day) || day.date !== date || day.locationId !== locationId) throw new Error('dataset-shape-mismatch')
      return { ...day, timeZone,
        coordinates: { latitude: context.location.latitude, longitude: context.location.longitude } }
    }
    const setCriticalError = (error: unknown) => {
      if (!active) return
      setResult({ context, key, retry, services, schedules: [], error:
        error instanceof UnsupportedCalculationProfileError
          ? { code: 'unsupported-profile', profile: error.profile }
          : { code: 'load-failed' },
        contextReady: false, enrichmentError: false,
      })
    }
    const enrich = async (selected: DisplaySchedule) => {
      try {
        if (context.source === 'official') {
          const dates = [addDays(context.date, -1), addDays(context.date, 1)].filter(date => !dateCoverage || coversOfficialDate(dateCoverage, date))
          const days = await services.getDays(context.localityId, dates, context.datasetRevision, context.provider)
          if (days.length !== dates.length) throw new Error('dataset-shape-mismatch')
          const neighbors = dates.map((date, index) => officialDay(days[index], date, context.localityId, context.timeZone))
          if (neighbors.some(day => !day)) throw new Error('dataset-neighbor-missing')
          if (active) setResult({ context, key, retry, services,
            schedules: [...neighbors.filter((day): day is DisplaySchedule => day !== null), selected],
            error: null, contextReady: true, enrichmentError: false })
          return
        }
        // Даём браузеру показать выбранный день до вычисления соседних суток.
        await new Promise<void>(resolve => window.setTimeout(resolve, 0))
        if (!active) return
        const radius = 4
        const dates = Array.from({ length: radius * 2 + 1 }, (_, index) => addDays(context.date, index - radius))
        const schedules = dates.map(date => date === selected.date ? selected
          : calculatePrayerSchedule(context.location, date, context.timeZone, context.settings))
        if (schedules.flatMap(buildScheduleEvents).some(event => event.status === 'resolved' && Math.abs(event.dayOffset) > 3)) {
          throw new Error('schedule-event-outside-window')
        }
        setResult({ context, key, retry, services, schedules, error: null, contextReady: true, enrichmentError: false })
      } catch (error) {
        // Ошибка доступа не отменяет проверенный снимок; несовместимые данные отменяют live-контекст.
        const storageUnavailable = error !== null && typeof error === 'object' && 'kind' in error && error.kind === 'storage'
        if (active) setResult(current => current?.key === key && current.retry === retry
          ? storageUnavailable && current.contextReady ? { ...current, enrichmentError: true }
            : { ...current, schedules: [selected], contextReady: false, enrichmentError: true }
          : current)
      }
    }
    if (selectedDay) {
      setResult(current => current?.key === key && current.retry === retry
        ? { ...current, enrichmentError: false }
        : current)
      void enrich(selectedDay)
      return () => { active = false }
    }
    const load = async () => {
      try {
        let selected: DisplaySchedule
        if (context.source === 'official') {
          const days = await services.getDays(context.localityId, [context.date], context.datasetRevision, context.provider)
          if (days.length !== 1) throw new Error('dataset-shape-mismatch')
          const day = officialDay(days[0], context.date, context.localityId, context.timeZone)
          if (!day) throw new Error('dataset-date-missing')
          selected = day
        } else {
          selected = calculatePrayerSchedule(context.location, context.date, context.timeZone, context.settings)
        }
        if (!active) return
        setResult({ context, key, retry, services, schedules: [selected], error: null, contextReady: false, enrichmentError: false })
        void enrich(selected)
      } catch (error: unknown) {
        setCriticalError(error)
      }
    }
    void load()
    return () => { active = false }
  }, [context, dateCoverage, enrichmentRetry, initialSnapshot, key, retry, services])
  useEffect(() => { resultRef.current = result }, [result])

  // Проверка во время render закрывает промежуток до cleanup/effect нового запроса.
  const matching = result?.key === key && result.retry === retry && result.services === services ? result : null
  const schedules = matching?.schedules ?? []
  const unavailable: ScheduleError | null = resolution && resolution.status !== 'ready'
    ? resolution.kind === 'calculated'
      ? { code: 'unsupported-profile', profile: resolution.settings.profile }
      : resolution.status === 'not-covered' ? { code: 'source-not-covered' }
        : resolution.status === 'invalid' ? { code: 'official-invalid' }
          : { code: 'official-not-loaded' }
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
    contextReady: Boolean(matching?.contextReady),
    officialHorizon: context?.source === 'official' ? {
      previous: !dateCoverage || coversOfficialDate(dateCoverage, addDays(context.date, -1)),
      next: !dateCoverage || coversOfficialDate(dateCoverage, addDays(context.date, 1)),
    } : undefined,
    enrichmentError: Boolean(matching?.enrichmentError),
    retrySchedule: () => setRetry((count) => count + 1),
    retryEnrichment: () => setEnrichmentRetry(count => count + 1),
  }
}
