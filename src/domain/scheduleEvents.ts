import { createLocationClock, DUM_RT_TIME_ZONE } from './locationTime'
import { addDays } from './date'
import type { CalculatedPrayerSchedule } from './prayerCalculation'
import type { PrayerDay, PrayerTime, SchedulePrayerKey } from './types'

export type PrayerSchedule = PrayerDay | CalculatedPrayerSchedule
export type EventKind = 'prayer' | 'jamaat' | 'marker'

interface EventDefinition {
  kind: EventKind
  label: string
  countdownLabel: string
}

const EVENT_DEFINITIONS: Record<SchedulePrayerKey, EventDefinition> = {
  suhurEnd: { kind: 'marker', label: 'Завершение сухура', countdownLabel: 'До конца сухура' },
  fajrJamaat: { kind: 'jamaat', label: 'Утренний намаз в мечетях', countdownLabel: 'До утреннего в мечети' },
  fajr: { kind: 'prayer', label: 'Фаджр', countdownLabel: 'До фаджра' },
  sunrise: { kind: 'marker', label: 'Восход', countdownLabel: 'До восхода' },
  zenith: { kind: 'marker', label: 'Зенит', countdownLabel: 'До зенита' },
  dhuhr: { kind: 'prayer', label: 'Зухр', countdownLabel: 'До зухра' },
  asr: { kind: 'prayer', label: 'Аср', countdownLabel: 'До асра' },
  maghrib: { kind: 'prayer', label: 'Магриб', countdownLabel: 'До магриба' },
  isha: { kind: 'prayer', label: 'Иша', countdownLabel: 'До иша' },
}

interface EventSource extends EventDefinition {
  key: SchedulePrayerKey
  scheduleDate: string
  timeZone: string
  time: PrayerTime
}

export interface ResolvedScheduleEvent extends EventSource {
  status: 'resolved'
  instant: number
  date: string
  dayOffset: number
}

export type ScheduleEvent = ResolvedScheduleEvent

export function buildScheduleEvents(schedule: PrayerSchedule): ScheduleEvent[] {
  const calculated = 'entries' in schedule
  const timeZone = calculated ? schedule.timeZone : DUM_RT_TIME_ZONE
  const clock = createLocationClock(timeZone)
  const keys = (Object.keys(EVENT_DEFINITIONS) as SchedulePrayerKey[])
    .filter((key) => calculated ? key in schedule.entries : key in schedule)

  return keys.map((key): ScheduleEvent => {
    const entry = calculated && key in schedule.entries
      ? schedule.entries[key as keyof typeof schedule.entries]
      : null
    const time = entry?.time ?? (schedule as PrayerDay)[key as keyof Omit<PrayerDay, 'date' | 'locationId'>]
    const source: EventSource = { ...EVENT_DEFINITIONS[key], key, scheduleDate: schedule.date, timeZone, time }
    // Поздний сухур наступает накануне: дата строки обозначает следующий день поста.
    const eventDate = !calculated && key === 'suhurEnd' && Number(time.split(':')[0]) >= 12
      ? addDays(schedule.date, -1) : schedule.date
    const instant = entry?.instant ?? clock.toInstant(eventDate, time).getTime()
    const date = clock.getCivilDate(new Date(instant))
    const dayOffset = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${schedule.date}T00:00:00Z`)) / 86_400_000
    return { ...source, status: 'resolved', instant, date, dayOffset }
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
    if (event.instant > nowInstant) {
      if (!next || event.instant < next.instant
        || (event.instant === next.instant && tieBreak(event, next) < 0)) next = event
    } else if (!current || event.instant > current.instant
      || (event.instant === current.instant && tieBreak(event, current) < 0)) current = event
  }
  return { current, next }
}
