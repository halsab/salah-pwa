import { addDays } from '../domain/date'
import { OFFICIAL_TIME_FIELDS, type PrayerDay, type PrayerKey, type PrayerTime } from '../domain/types'
import { diagnoseOfficialSchedule, type ScheduleDiagnostic } from './scheduleDiagnostics'

const DATE_PATTERN = /^(\d{2})\.(\d{2})\.(\d{4})$/
const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/

function parseDate(value: string, context: string): string {
  const match = DATE_PATTERN.exec(value.trim())
  if (!match) {
    throw new Error(`${context} [date]: Некорректная дата`)
  }

  const [, day = '', month = '', year = ''] = match
  const isoDate = `${year}-${month}-${day}`
  const parsed = new Date(`${isoDate}T00:00:00.000Z`)

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() + 1 !== Number(month) ||
    parsed.getUTCDate() !== Number(day)
  ) {
    throw new Error(`${context} [date]: Некорректная дата`)
  }

  return isoDate
}

function parseTime(value: string, context: string, field: PrayerKey): PrayerTime {
  const match = TIME_PATTERN.exec(value.trim())
  if (!match) {
    throw new Error(`${context} [${field}]: Некорректное время или пропущенное значение`)
  }

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) {
    throw new Error(`${context} [${field}]: Некорректное время или пропущенное значение`)
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}` as PrayerTime
}

export function parseDumRtCsv(csv: string, locationId: string): PrayerDay[] {
  // В части официальных файлов граница годов склеена без перевода строки.
  const normalizedCsv = csv
    .replace(/^\uFEFF/, '')
    .replace(/([^;\r\n])(\d{2}\.\d{2}\.\d{4};)/g, '$1\n$2')

  return normalizedCsv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const lineNumber = index + 1
      const columns = line.split(';')
      const context = `${locationId} ${columns[0]} (строка ${lineNumber})`
      if (columns.length !== 9 && columns.length !== 10) {
        throw new Error(`${context} [date, ${OFFICIAL_TIME_FIELDS.join(', ')}]: Ожидалось 9 или 10 столбцов в строке ${lineNumber}`)
      }

      const [date, suhurEnd, fajrJamaat, sunrise, zenith, dhuhr, asr, maghrib, isha] =
        columns

      if (
        date === undefined ||
        suhurEnd === undefined ||
        fajrJamaat === undefined ||
        sunrise === undefined ||
        zenith === undefined ||
        dhuhr === undefined ||
        asr === undefined ||
        maghrib === undefined ||
        isha === undefined
      ) {
        throw new Error(`${context}: Неполная строка ${lineNumber}`)
      }

      return {
        locationId,
        date: parseDate(date, context),
        suhurEnd: parseTime(suhurEnd, context, 'suhurEnd'),
        fajrJamaat: parseTime(fajrJamaat, context, 'fajrJamaat'),
        sunrise: parseTime(sunrise, context, 'sunrise'),
        zenith: parseTime(zenith, context, 'zenith'),
        dhuhr: parseTime(dhuhr, context, 'dhuhr'),
        asr: parseTime(asr, context, 'asr'),
        maghrib: parseTime(maghrib, context, 'maghrib'),
        isha: parseTime(isha, context, 'isha'),
      }
    })
}

export function validateSchedule(
  days: PrayerDay[],
  year: number,
  locationId = days[0]?.locationId ?? 'неизвестное место',
): ScheduleDiagnostic[] {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) {
    throw new Error(`${locationId} ${year} [date]: некорректный год`)
  }
  const dates = new Set<string>()
  for (const day of days) {
    const context = `${locationId} ${day.date}`
    if (day.locationId !== locationId) {
      throw new Error(`${context} [locationId]: смешаны населённые пункты`)
    }
    const [dateYear, month, dateDay] = day.date.split('-')
    if (parseDate(`${dateDay}.${month}.${dateYear}`, context) !== day.date) {
      throw new Error(`${context} [date]: Некорректная дата`)
    }
    if (!day.date.startsWith(`${year}-`)) {
      throw new Error(`${context} [date]: дата не из ${year} года`)
    }
    if (dates.has(day.date)) {
      throw new Error(`${context} [date]: повторяется дата`)
    }
    for (const field of OFFICIAL_TIME_FIELDS) parseTime(day[field], context, field)
    dates.add(day.date)
  }

  const expectedCount = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000
  for (let offset = 0; offset < expectedCount; offset += 1) {
    const date = addDays(`${year}-01-01`, offset)
    if (!dates.has(date)) throw new Error(`${locationId} ${date} [date]: пропущен день расписания`)
  }
  return diagnoseOfficialSchedule(days)
}
