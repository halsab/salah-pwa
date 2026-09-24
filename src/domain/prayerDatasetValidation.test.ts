import { describe, expect, it } from 'vitest'

import { completeDataset } from '../test/prayerDataset'
import { isPrayerDataset, normalizeStoredPrayerDataset, normalizeStoredPrayerDay } from './prayerDatasetValidation'

const canonical = completeDataset()
const canonicalDay = canonical.days[0]
if (!canonicalDay) throw new Error('Не найден тестовый день')
function legacy(day: (typeof canonical.days)[number]): Record<string, unknown> {
  const value = { ...day, suhurEnd: day.fajrStart } as Record<string, unknown>
  delete value.fajrStart
  return value
}
const legacyDay = legacy(canonicalDay)

describe('валидация набора расписаний', () => {
  it('принимает только канонический network/generated v2', () => {
    expect(isPrayerDataset(canonical)).toBe(true)
    expect(isPrayerDataset({ ...canonical, days: canonical.days.map(legacy) })).toBe(false)
    expect(isPrayerDataset({ ...canonical, days: canonical.days.map(day => ({ ...day, suhurEnd: day.fajrStart })) })).toBe(false)
    expect(isPrayerDataset({ ...canonical, schemaVersion: 3 })).toBe(false)
  })

  it.each([1, 2])('нормализует локальную legacy schema %s только на storage boundary', (schemaVersion) => {
    expect(normalizeStoredPrayerDay(legacyDay, schemaVersion)).toEqual(canonicalDay)
    const normalized = normalizeStoredPrayerDataset({ ...canonical, schemaVersion, days: canonical.days.map(legacy) })
    expect(normalized).toEqual(canonical)
    expect(normalized?.days[0]).not.toHaveProperty('suhurEnd')
  })

  it('отклоняет смешанную форму и неизвестную локальную schema', () => {
    expect(normalizeStoredPrayerDay({ ...canonicalDay, suhurEnd: canonicalDay.fajrStart }, 2)).toBeNull()
    expect(normalizeStoredPrayerDay(legacyDay, 3)).toBeNull()
    expect(normalizeStoredPrayerDataset({ ...canonical, schemaVersion: 3 })).toBeNull()
  })
})
