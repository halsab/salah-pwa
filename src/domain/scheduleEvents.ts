import { createLocationClock, DUM_RT_TIME_ZONE } from './locationTime'
import { addDays } from './date'
import { calculateSolarZenith, type CalculatedPrayerSchedule } from './prayerCalculation'
import type { PrayerDay, PrayerKey, PrayerTime, SchedulePrayerKey } from './types'

export type PrayerSchedule = PrayerDay | CalculatedPrayerSchedule
export type EventKind = 'prayer' | 'jamaat' | 'marker'

function isCalculatedSchedule(schedule: PrayerSchedule): schedule is CalculatedPrayerSchedule {
  return 'entries' in schedule
}

interface EventDefinition {
  kind: EventKind
}

const EVENT_DEFINITIONS: Record<SchedulePrayerKey, EventDefinition> = {
  fajrStart: { kind: 'prayer' },
  fajrJamaat: { kind: 'jamaat' },
  dhuhrJamaat: { kind: 'jamaat' },
  asrJamaat: { kind: 'jamaat' },
  maghribJamaat: { kind: 'jamaat' },
  ishaJamaat: { kind: 'jamaat' },
  fajr: { kind: 'prayer' },
  sunrise: { kind: 'marker' },
  zenith: { kind: 'marker' },
  dhuhr: { kind: 'prayer' },
  asr: { kind: 'prayer' },
  maghrib: { kind: 'prayer' },
  isha: { kind: 'prayer' },
}

interface EventSource extends EventDefinition {
  key: SchedulePrayerKey
  scheduleDate: string
  timeZone: string
  time: PrayerTime
}

export interface ResolvedScheduleEvent extends EventSource {
  status: 'resolved'
  provenance: 'published' | 'calculated'
  instant: number
  date: string
  dayOffset: number
}

export interface UnavailableScheduleEvent extends EventDefinition {
  key: 'zenith'
  status: 'unavailable'
  reason: 'calculation-failed'
  provenance: 'calculated'
  scheduleDate: string
  timeZone: string
}

export type ScheduleEvent = ResolvedScheduleEvent | UnavailableScheduleEvent

export function buildScheduleEvents(schedule: PrayerSchedule): ScheduleEvent[] {
  const calculated = isCalculatedSchedule(schedule)
  const timeZone = calculated ? schedule.timeZone : schedule.timeZone ?? DUM_RT_TIME_ZONE
  const clock = createLocationClock(timeZone)
  const keys = (Object.keys(EVENT_DEFINITIONS) as SchedulePrayerKey[])
    .filter((key) => calculated ? key in schedule.entries : key in schedule && schedule[key as keyof PrayerDay] !== undefined)
  if (!calculated && !keys.includes('zenith')) keys.push('zenith')

  return keys.map((key): ScheduleEvent => {
    const entry = calculated && key in schedule.entries
      ? schedule.entries[key as keyof typeof schedule.entries]
      : null
    const day = calculated ? null : schedule
    const officialTime = day && key !== 'fajr' ? day[key] : undefined
    let time: PrayerTime | undefined = entry?.time ?? officialTime
    let instant = entry?.instant
    let provenance: ResolvedScheduleEvent['provenance'] = calculated ? 'calculated' : day?.provenance?.[key as PrayerKey] ?? 'published'
    if (key === 'zenith' && !time && !calculated) {
      const transit = day?.coordinates ? calculateSolarZenith(day.coordinates, day.date, timeZone) : null
      if (!transit) return { ...EVENT_DEFINITIONS.zenith, key: 'zenith', status: 'unavailable', reason: 'calculation-failed', provenance: 'calculated', scheduleDate: schedule.date, timeZone }
      time = transit.time
      instant = transit.instant
      provenance = 'calculated'
    }
    if (!time) return { ...EVENT_DEFINITIONS.zenith, key: 'zenith', status: 'unavailable', reason: 'calculation-failed', provenance: 'calculated', scheduleDate: schedule.date, timeZone }
    const source: EventSource = { ...EVENT_DEFINITIONS[key], key, scheduleDate: schedule.date, timeZone, time }
    // Позднее начало Фаджра наступает накануне: дата строки обозначает следующий день поста.
    const eventDate = !calculated && key === 'fajrStart' && Number(time.split(':')[0]) >= 12
      ? addDays(schedule.date, -1) : schedule.date
    const resolvedInstant = instant ?? clock.toInstant(eventDate, time).getTime()
    const date = clock.getCivilDate(new Date(resolvedInstant))
    const dayOffset = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${schedule.date}T00:00:00Z`)) / 86_400_000
    return { ...source, status: 'resolved', provenance, instant: resolvedInstant, date, dayOffset }
  })
}

const KIND_PRIORITY: Record<EventKind, number> = { prayer: 0, jamaat: 1, marker: 2 }

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
    if (event.status !== 'resolved') continue
    if (event.instant > nowInstant) {
      if (!next || event.instant < next.instant
        || (event.instant === next.instant && tieBreak(event, next) < 0)) next = event
    } else if (!current || event.instant > current.instant
      || (event.instant === current.instant && tieBreak(event, current) < 0)) current = event
  }
  return { current, next }
}
