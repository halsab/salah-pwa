import type { PrayerDay, PrayerTime, SalahPrayerKey } from './types'

const MOSCOW_UTC_OFFSET = '+03:00'

const SALAH_PRAYERS: ReadonlyArray<{
  key: SalahPrayerKey
  label: string
}> = [
  { key: 'fajrJamaat', label: 'Утренний намаз' },
  { key: 'dhuhr', label: 'Зухр' },
  { key: 'asr', label: 'Аср' },
  { key: 'maghrib', label: 'Магриб' },
  { key: 'isha', label: 'Иша' },
]

export interface NextPrayer {
  key: SalahPrayerKey
  label: string
  date: string
  time: PrayerTime
  remainingSeconds: number
}

function prayerInstant(date: string, time: PrayerTime): Date {
  // Татарстан круглый год живёт по UTC+3, поэтому время источника не зависит от DST устройства.
  return new Date(`${date}T${time}:00${MOSCOW_UTC_OFFSET}`)
}

function nextInDay(now: Date, day: PrayerDay): NextPrayer | null {
  for (const prayer of SALAH_PRAYERS) {
    const time = day[prayer.key]
    const instant = prayerInstant(day.date, time)
    if (instant.getTime() >= now.getTime()) {
      return {
        ...prayer,
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

export function findNextPrayer(
  now: Date,
  today: PrayerDay,
  tomorrow?: PrayerDay,
): NextPrayer | null {
  return nextInDay(now, today) ?? (tomorrow ? nextInDay(now, tomorrow) : null)
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
