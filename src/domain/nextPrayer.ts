import type { CalculatedPrayerSchedule } from './prayerCalculation'
import type {
  CalculatedPrayerKey,
  PrayerDay,
  PrayerKey,
  PrayerTime,
  SchedulePrayerKey,
} from './types'

const MOSCOW_UTC_OFFSET = '+03:00'

const OFFICIAL_EVENTS: ReadonlyArray<{
  key: PrayerKey
  label: string
  countdownLabel: string
}> = [
  {
    key: 'suhurEnd',
    label: 'Завершение сухура',
    countdownLabel: 'До сухура',
  },
  {
    key: 'fajrJamaat',
    label: 'Утренний намаз',
    countdownLabel: 'До утреннего в мечети',
  },
  { key: 'sunrise', label: 'Восход', countdownLabel: 'До восхода' },
  { key: 'zenith', label: 'Зенит', countdownLabel: 'До зенита' },
  { key: 'dhuhr', label: 'Зухр', countdownLabel: 'До зухра' },
  { key: 'asr', label: 'Аср', countdownLabel: 'До асра' },
  { key: 'maghrib', label: 'Магриб', countdownLabel: 'До магриба' },
  { key: 'isha', label: 'Иша', countdownLabel: 'До иша' },
]

const CALCULATED_EVENTS: ReadonlyArray<{
  key: CalculatedPrayerKey
  label: string
  countdownLabel: string
}> = [
  { key: 'fajr', label: 'Фаджр', countdownLabel: 'До фаджра' },
  { key: 'sunrise', label: 'Восход', countdownLabel: 'До восхода' },
  { key: 'zenith', label: 'Зенит', countdownLabel: 'До зенита' },
  { key: 'dhuhr', label: 'Зухр', countdownLabel: 'До зухра' },
  { key: 'asr', label: 'Аср', countdownLabel: 'До асра' },
  { key: 'maghrib', label: 'Магриб', countdownLabel: 'До магриба' },
  { key: 'isha', label: 'Иша', countdownLabel: 'До иша' },
]

type PrayerSchedule = PrayerDay | CalculatedPrayerSchedule

export interface NextPrayer {
  key: SchedulePrayerKey
  label: string
  countdownLabel: string
  date: string
  time: PrayerTime
  remainingSeconds: number
}

export type CurrentPrayer = Omit<NextPrayer, 'remainingSeconds'>

function prayerInstant(date: string, time: PrayerTime): Date {
  // Татарстан круглый год живёт по UTC+3, поэтому время источника не зависит от DST устройства.
  return new Date(`${date}T${time}:00${MOSCOW_UTC_OFFSET}`)
}

function nextInOfficialDay(now: Date, day: PrayerDay): NextPrayer | null {
  for (const event of OFFICIAL_EVENTS) {
    const time = day[event.key]
    const instant = prayerInstant(day.date, time)
    if (instant.getTime() > now.getTime()) {
      return {
        ...event,
        date: day.date,
        time,
        remainingSeconds: Math.max(
          0,
          Math.ceil((instant.getTime() - now.getTime()) / 1_000),
        ),
      }
    }
  }

  return null
}

function nextInCalculatedDay(
  now: Date,
  day: CalculatedPrayerSchedule,
): NextPrayer | null {
  for (const event of CALCULATED_EVENTS) {
    const entry = day.entries[event.key]
    if (entry.instant > now.getTime()) {
      return {
        ...event,
        date: day.date,
        time: entry.time,
        remainingSeconds: Math.max(
          0,
          Math.ceil((entry.instant - now.getTime()) / 1_000),
        ),
      }
    }
  }

  return null
}

function nextInDay(now: Date, day: PrayerSchedule): NextPrayer | null {
  return 'entries' in day
    ? nextInCalculatedDay(now, day)
    : nextInOfficialDay(now, day)
}

export function findNextPrayer(
  now: Date,
  today: PrayerSchedule,
  tomorrow?: PrayerSchedule,
): NextPrayer | null {
  return nextInDay(now, today) ?? (tomorrow ? nextInDay(now, tomorrow) : null)
}

function currentInDay(now: Date, day: PrayerSchedule): CurrentPrayer | null {
  if ('entries' in day) {
    for (let index = CALCULATED_EVENTS.length - 1; index >= 0; index -= 1) {
      const event = CALCULATED_EVENTS[index]!
      const entry = day.entries[event.key]
      if (entry.instant <= now.getTime()) {
        return { ...event, date: day.date, time: entry.time }
      }
    }
  } else {
    for (let index = OFFICIAL_EVENTS.length - 1; index >= 0; index -= 1) {
      const event = OFFICIAL_EVENTS[index]!
      const time = day[event.key]
      if (prayerInstant(day.date, time).getTime() <= now.getTime()) {
        return { ...event, date: day.date, time }
      }
    }
  }

  return null
}

export function findCurrentPrayer(
  now: Date,
  today: PrayerSchedule,
  yesterday?: PrayerSchedule,
): CurrentPrayer | null {
  return currentInDay(now, today) ?? (yesterday ? currentInDay(now, yesterday) : null)
}

export function formatRemainingTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeSeconds / 3_600)
  const minutes = Math.floor((safeSeconds % 3_600) / 60)
  const seconds = safeSeconds % 60

  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')
}
