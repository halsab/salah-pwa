import type { PrayerDay, PrayerTime } from '../src/domain/types'
import { describe, expect, it } from 'vitest'

import { selectCompleteDatasetYears } from './selectDatasetYear'

const TIME = '05:00' as PrayerTime

function completeYear(year: number, locationId: string): PrayerDay[] {
  const days: PrayerDay[] = []
  const end = Date.UTC(year + 1, 0, 1)

  for (let timestamp = Date.UTC(year, 0, 1); timestamp < end; timestamp += 86_400_000) {
    days.push({
      locationId,
      date: new Date(timestamp).toISOString().slice(0, 10),
      suhurEnd: TIME,
      fajrJamaat: TIME,
      sunrise: TIME,
      zenith: TIME,
      dhuhr: TIME,
      asr: TIME,
      maghrib: TIME,
      isha: TIME,
    })
  }

  return days
}

describe('selectCompleteDatasetYears', () => {
  it('добавляет следующий год только когда он полностью опубликован для всех пунктов', () => {
    const kazan = [
      ...completeYear(2026, 'kazan'),
      ...completeYear(2027, 'kazan'),
      ...completeYear(2028, 'kazan'),
    ]
    const aznakaevo = [
      ...completeYear(2026, 'aznakaevo'),
      ...completeYear(2027, 'aznakaevo'),
      ...completeYear(2028, 'aznakaevo'),
    ]

    expect(selectCompleteDatasetYears([kazan, aznakaevo], 2026)).toEqual([2026, 2027])

    aznakaevo.splice(365, 1)
    expect(selectCompleteDatasetYears([kazan, aznakaevo], 2026)).toEqual([2026])
  })

  it('не откатывается на уже завершившийся год', () => {
    expect(() => selectCompleteDatasetYears([completeYear(2025, 'kazan')], 2026)).toThrow(
      'Нет полного расписания на 2026 год или позднее',
    )
  })
})
