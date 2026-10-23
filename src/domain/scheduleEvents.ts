import { createLocationClock } from './locationTime'
import { type CalculatedPrayerSchedule } from './prayerCalculation'
import type { CalculatedPrayerKey, PrayerTime } from './types'

export type PrayerSchedule = CalculatedPrayerSchedule
export type EventKind = 'prayer' | 'marker'

export interface ResolvedScheduleEvent {
  kind: EventKind
  key: CalculatedPrayerKey
  scheduleDate: string
  timeZone: string
  time: PrayerTime
  status: 'resolved'
  provenance: 'calculated'
  instant: number
  date: string
  dayOffset: number
}

export type ScheduleEvent = ResolvedScheduleEvent

const MARKER_KEYS: ReadonlySet<CalculatedPrayerKey> = new Set(['sunrise', 'zenith'])

export function buildScheduleEvents(schedule: PrayerSchedule): ScheduleEvent[] {
  const clock = createLocationClock(schedule.timeZone)
  return (Object.keys(schedule.entries) as CalculatedPrayerKey[]).map(key => {
    const entry = schedule.entries[key]
    const date = clock.getCivilDate(new Date(entry.instant))
    const dayOffset = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${schedule.date}T00:00:00Z`)) / 86_400_000
    return {
      kind: MARKER_KEYS.has(key) ? 'marker' : 'prayer',
      key,
      scheduleDate: schedule.date,
      timeZone: schedule.timeZone,
      time: entry.time,
      status: 'resolved',
      provenance: 'calculated',
      instant: entry.instant,
      date,
      dayOffset,
    }
  })
}

const KIND_PRIORITY: Record<EventKind, number> = { prayer: 0, marker: 1 }

function tieBreak(left: ResolvedScheduleEvent, right: ResolvedScheduleEvent): number {
  const leftId = `${left.key}:${left.scheduleDate}:${left.timeZone}`
  const rightId = `${right.key}:${right.scheduleDate}:${right.timeZone}`
  return KIND_PRIORITY[left.kind] - KIND_PRIORITY[right.kind]
    || (leftId < rightId ? -1 : leftId > rightId ? 1 : 0)
}

export function selectEventPair(now: Date, events: readonly ScheduleEvent[]): {
  current: ResolvedScheduleEvent | null
  next: ResolvedScheduleEvent | null
} {
  let current: ResolvedScheduleEvent | null = null
  let next: ResolvedScheduleEvent | null = null
  const nowInstant = now.getTime()
  for (const event of events) {
    if (event.instant > nowInstant) {
      if (!next || event.instant < next.instant
        || (event.instant === next.instant && tieBreak(event, next) < 0)) next = event
    } else if (!current || event.instant > current.instant
      || (event.instant === current.instant && tieBreak(event, current) < 0)) current = event
  }
  return { current, next }
}
