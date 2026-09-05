import type { PrayerTime } from './types'

export const DUM_RT_TIME_ZONE = 'Europe/Moscow'

export type CivilDate = `${number}-${number}-${number}`

export interface LocationClock {
  readonly timeZone: string
  getCivilDate: (instant: Date) => CivilDate
  getTime: (instant: Date) => PrayerTime
  getUtcOffset: (instant: Date) => string
  toInstant: (date: string, time: PrayerTime) => Date
}

interface ZonedDateTimeParts {
  year: string
  month: string
  day: string
  hour: string
  minute: string
  second: string
}

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone)
  if (cached) return cached

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  formatterCache.set(timeZone, formatter)
  return formatter
}

function assertTimeZone(timeZone: string): void {
  if (!isValidTimeZone(timeZone)) {
    throw new RangeError(`Unsupported IANA time zone: ${timeZone}`)
  }
}

function getZonedParts(instant: Date, timeZone: string): ZonedDateTimeParts {
  assertTimeZone(timeZone)

  const parts = new Map(
    getFormatter(timeZone)
      .formatToParts(instant)
      .map(({ type, value }) => [type, value]),
  )
  const read = (type: keyof ZonedDateTimeParts): string => {
    const value = parts.get(type)
    if (value === undefined) throw new RangeError(`Missing date part: ${type}`)
    return value
  }

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  }
}

function parseCivilDate(date: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) throw new RangeError(`Invalid civil date: ${date}`)

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid civil date: ${date}`)
  }

  return [year, month, day]
}

function parseTime(time: PrayerTime): [number, number] {
  const match = /^(\d{2}):(\d{2})$/.exec(time)
  if (!match) throw new RangeError(`Invalid time: ${time}`)

  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) throw new RangeError(`Invalid time: ${time}`)
  return [hour, minute]
}

function getUtcOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = getZonedParts(instant, timeZone)
  const localTimeAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  const instantWithoutMilliseconds = Math.floor(instant.getTime() / 1_000) * 1_000
  return Math.round((localTimeAsUtc - instantWithoutMilliseconds) / 60_000)
}

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false

  try {
    getFormatter(timeZone)
    return true
  } catch {
    return false
  }
}

export function getDeviceTimeZone(): string {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return isValidTimeZone(timeZone) ? timeZone : 'UTC'
}

export function getCivilDate(instant: Date, timeZone: string): CivilDate {
  const { year, month, day } = getZonedParts(instant, timeZone)
  return `${year}-${month}-${day}` as CivilDate
}

export function getZonedTime(instant: Date, timeZone: string): PrayerTime {
  const { hour, minute } = getZonedParts(instant, timeZone)
  return `${hour}:${minute}` as PrayerTime
}

export function getUtcOffset(instant: Date, timeZone: string): string {
  const offsetMinutes = getUtcOffsetMinutes(instant, timeZone)
  if (offsetMinutes === 0) return 'UTC'

  const sign = offsetMinutes < 0 ? '−' : '+'
  const absoluteMinutes = Math.abs(offsetMinutes)
  const hours = Math.floor(absoluteMinutes / 60)
  const minutes = absoluteMinutes % 60
  return `UTC${sign}${hours}${minutes === 0 ? '' : `:${String(minutes).padStart(2, '0')}`}`
}

export function zonedDateTimeToInstant(
  date: string,
  time: PrayerTime,
  timeZone: string,
): Date {
  assertTimeZone(timeZone)
  const [year, month, day] = parseCivilDate(date)
  const [hour, minute] = parseTime(time)
  const wallTime = Date.UTC(year, month - 1, day, hour, minute)
  let instant = wallTime

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const adjusted = wallTime - getUtcOffsetMinutes(new Date(instant), timeZone) * 60_000
    if (adjusted === instant) break
    instant = adjusted
  }

  const result = new Date(instant)
  if (getCivilDate(result, timeZone) !== date || getZonedTime(result, timeZone) !== time) {
    throw new RangeError(`Local time does not exist in ${timeZone}: ${date} ${time}`)
  }
  return result
}

export function createLocationClock(timeZone: string): LocationClock {
  assertTimeZone(timeZone)
  return {
    timeZone,
    getCivilDate: (instant) => getCivilDate(instant, timeZone),
    getTime: (instant) => getZonedTime(instant, timeZone),
    getUtcOffset: (instant) => getUtcOffset(instant, timeZone),
    toInstant: (date, time) => zonedDateTimeToInstant(date, time, timeZone),
  }
}
