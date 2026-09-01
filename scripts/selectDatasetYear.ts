import { validateSchedule } from '../src/data/parseDumRtCsv'
import type { PrayerDay } from '../src/domain/types'

function hasCompleteYear(days: PrayerDay[], year: number): boolean {
  try {
    validateSchedule(
      days.filter(({ date }) => date.startsWith(`${year}-`)),
      year,
    )
    return true
  } catch {
    return false
  }
}

export function selectCompleteDatasetYears(
  schedules: PrayerDay[][],
  currentYear: number,
): number[] {
  const years = [currentYear, currentYear + 1].filter((year) =>
    schedules.every((days) => hasCompleteYear(days, year)),
  )

  if (years[0] !== currentYear) {
    throw new Error(`Нет полного расписания на ${currentYear} год или позднее`)
  }

  return years
}
