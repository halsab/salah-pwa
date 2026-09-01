import type { PrayerDay, PrayerTime } from '../domain/types'

const DATE_PATTERN = /^(\d{2})\.(\d{2})\.(\d{4})$/
const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/

function parseDate(value: string, lineNumber: number): string {
  const match = DATE_PATTERN.exec(value.trim())
  if (!match) {
    throw new Error(`Некорректная дата в строке ${lineNumber}`)
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
    throw new Error(`Некорректная дата в строке ${lineNumber}`)
  }

  return isoDate
}

function parseTime(value: string, lineNumber: number): PrayerTime {
  const match = TIME_PATTERN.exec(value.trim())
  if (!match) {
    throw new Error(`Некорректное время в строке ${lineNumber}`)
  }

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) {
    throw new Error(`Некорректное время в строке ${lineNumber}`)
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
      if (columns.length !== 9 && columns.length !== 10) {
        throw new Error(`Ожидалось 9 или 10 столбцов в строке ${lineNumber}`)
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
        throw new Error(`Неполная строка ${lineNumber}`)
      }

      return {
        locationId,
        date: parseDate(date, lineNumber),
        suhurEnd: parseTime(suhurEnd, lineNumber),
        fajrJamaat: parseTime(fajrJamaat, lineNumber),
        sunrise: parseTime(sunrise, lineNumber),
        zenith: parseTime(zenith, lineNumber),
        dhuhr: parseTime(dhuhr, lineNumber),
        asr: parseTime(asr, lineNumber),
        maghrib: parseTime(maghrib, lineNumber),
        isha: parseTime(isha, lineNumber),
      }
    })
}

export function validateSchedule(days: PrayerDay[], year: number): void {
  const yearPrefix = `${year}-`
  const dates = new Set<string>()

  for (const day of days) {
    if (!day.date.startsWith(yearPrefix)) {
      throw new Error(`Расписание содержит дату не из ${year} года: ${day.date}`)
    }
    if (dates.has(day.date)) {
      throw new Error(`В расписании повторяется дата ${day.date}`)
    }
    dates.add(day.date)
  }

  const expectedDays = new Date(Date.UTC(year + 1, 0, 1)).getTime() - new Date(Date.UTC(year, 0, 1)).getTime()
  const expectedCount = expectedDays / 86_400_000
  if (days.length !== expectedCount) {
    throw new Error(`В расписании ${days.length} дней вместо ${expectedCount}`)
  }
}
