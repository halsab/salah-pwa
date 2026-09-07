import { addDays } from '../domain/date'
import { OFFICIAL_TIME_FIELDS, type PrayerDay, type PrayerKey } from '../domain/types'

export interface ScheduleDiagnostic {
  code: 'previous-day-suhur' | 'unusual-order' | 'equal-times' | 'midnight-transition' | 'day-jump'
  locationId: string
  date: string
  fields: PrayerKey[]
  reason: string
}

function minutes(time: string): number {
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  return hours * 60 + minutes
}

export function diagnoseOfficialSchedule(days: readonly PrayerDay[]): ScheduleDiagnostic[] {
  const diagnostics: ScheduleDiagnostic[] = []
  const sorted = [...days].sort((left, right) =>
    left.locationId.localeCompare(right.locationId) || left.date.localeCompare(right.date))
  let previous: PrayerDay | undefined
  for (const day of sorted) {
    const warn = (code: ScheduleDiagnostic['code'], fields: PrayerKey[], reason: string) => {
      diagnostics.push({ code, locationId: day.locationId, date: day.date, fields, reason })
    }
    if (minutes(day.suhurEnd) >= 12 * 60) {
      warn('previous-day-suhur', ['suhurEnd'], `Сухур ${day.suhurEnd}: календарная дата ${addDays(day.date, -1)}, накануне дня поста ${day.date}; значение сохранено.`)
    }
    for (const [index, field] of OFFICIAL_TIME_FIELDS.entries()) {
      for (const other of OFFICIAL_TIME_FIELDS.slice(index + 1)) {
        if (day[field] === day[other]) {
          warn('equal-times', [field, other], `Совпадающие значения ${day[field]}; события остаются раздельными.`)
        }
      }
    }
    const expectedOrder: readonly (readonly [PrayerKey, PrayerKey])[] = [
      ['suhurEnd', 'fajrJamaat'], ['fajrJamaat', 'sunrise'], ['sunrise', 'zenith'],
      ['zenith', 'dhuhr'], ['dhuhr', 'asr'], ['asr', 'maghrib'], ['maghrib', 'isha'],
    ]
    for (const [earlier, later] of expectedOrder) {
      if (earlier === 'suhurEnd' && minutes(day.suhurEnd) >= 12 * 60) continue
      if (minutes(day[earlier]) > minutes(day[later])) {
        warn('unusual-order', [earlier, later], `${earlier} ${day[earlier]} позже ${later} ${day[later]}: возможное противоречие или переход суток; значения и даты не исправлены.`)
      }
    }
    if (previous?.locationId === day.locationId && addDays(previous.date, 1) === day.date) {
      for (const field of OFFICIAL_TIME_FIELDS) {
        const before = minutes(previous[field])
        const after = minutes(day[field])
        const difference = Math.abs(after - before)
        if ((before >= 18 * 60 && after < 6 * 60) || (after >= 18 * 60 && before < 6 * 60)) {
          warn('midnight-transition', [field], `${previous.date} ${previous[field]} → ${day.date} ${day[field]}: переход через полночь требует проверки даты у источника.`)
        }
        if (Math.min(difference, 24 * 60 - difference) > 60) {
          warn('day-jump', [field], `${previous.date} ${previous[field]} → ${day.date} ${day[field]}: изменение более часа; возможна смена сезонного правила или ошибка источника.`)
        }
      }
    }
    previous = day
  }
  return diagnostics
}
