import { useEffect, useMemo, useState } from 'react'

import type { DaylightWindow } from '../../domain/theme'
import type { Place } from '../../domain/place'
import type { ResolvedPrayerSource } from '../../domain/prayerSource'
import { calculatePrayerSchedule } from '../../domain/prayerCalculation'
import { buildScheduleEvents, type PrayerSchedule } from '../../domain/scheduleEvents'
import { isPrayerDay } from '../../domain/prayerDatasetValidation'
import type { PrayerDay } from '../../domain/types'

interface DaylightServices {
  getDays: (locationId: string, dates: readonly string[], datasetRevision: string) => Promise<(PrayerDay | undefined)[]>
}

export function resolveDaylightWindow(schedule: PrayerSchedule): DaylightWindow | null {
  const events = buildScheduleEvents(schedule)
  const sunrise = events.find(event => event.key === 'sunrise')?.instant
  const maghrib = events.find(event => event.key === 'maghrib')?.instant
  return sunrise !== undefined && maghrib !== undefined && sunrise < maghrib
    ? { sunrise, maghrib }
    : null
}

export function useDaylightWindow({ services, location, resolution, date }: {
  services: DaylightServices
  location: Place | null
  resolution: ResolvedPrayerSource | null
  date: string
}): DaylightWindow | null {
  const request = location && resolution?.status === 'ready'
    ? resolution.kind === 'official' && resolution.locationId && resolution.revision
      ? { source: 'official' as const, date, locationId: resolution.locationId, revision: resolution.revision }
      : resolution.kind === 'calculated'
        ? { source: 'calculated' as const, date, location: { latitude: location.latitude, longitude: location.longitude }, timeZone: resolution.timeZone, settings: resolution.settings }
        : null
    : null
  const serialized = request ? JSON.stringify(request) : null
  const stableRequest = useMemo(() => serialized ? JSON.parse(serialized) as typeof request : null, [serialized])
  const [result, setResult] = useState<{ key: string; services: DaylightServices; daylight: DaylightWindow | null } | null>(null)

  useEffect(() => {
    if (!stableRequest || !serialized) return
    let active = true
    const load = async () => {
      if (stableRequest.source === 'calculated') {
        return calculatePrayerSchedule(stableRequest.location, stableRequest.date, stableRequest.timeZone, stableRequest.settings)
      }
      const [day] = await services.getDays(stableRequest.locationId, [stableRequest.date], stableRequest.revision)
      if (!day || !isPrayerDay(day) || day.date !== stableRequest.date || day.locationId !== stableRequest.locationId) return null
      return day
    }
    void load().then(schedule => {
      if (active) setResult({ key: serialized, services, daylight: schedule ? resolveDaylightWindow(schedule) : null })
    }).catch(() => {
      if (active) setResult({ key: serialized, services, daylight: null })
    })
    return () => { active = false }
  }, [serialized, services, stableRequest])

  return result?.key === serialized && result.services === services ? result.daylight : null
}
