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

  it('принимает provider-neutral данные с явной coverage и отсутствующими необязательными событиями', () => {
    const providerDataset = {
      ...canonical,
      schemaVersion: 3,
      provider: { id: 'synthetic-a', revision: 'rev-1', timeZone: 'Asia/Almaty', coverage: {
        geographic: 'KZ-TEST', startDate: '2026-01-01', endDate: '2026-12-31',
      } },
      locations: canonical.locations.map(location => ({ ...location, timeZone: 'Asia/Almaty' })),
      days: canonical.days.map(({ fajrJamaat: _jamaat, zenith: _zenith, ...day }) => day),
    }
    expect(isPrayerDataset(providerDataset)).toBe(true)
    expect(isPrayerDataset({ ...providerDataset, provider: { ...providerDataset.provider, timeZone: 'Mars/Olympus' } })).toBe(false)
    expect(isPrayerDataset({ ...providerDataset, provider: { ...providerDataset.provider, coverage: null } })).toBe(false)
    expect(isPrayerDataset({ ...providerDataset, days: providerDataset.days.map((day, index) => index === 0 ? { ...day, provenance: null } : day) })).toBe(false)
    expect(isPrayerDataset({ ...providerDataset, days: providerDataset.days.slice(1) })).toBe(false)
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

  it('нормализует provider schema 3 без потери optional fields и provenance', () => {
    const providerDataset = {
      ...canonical,
      schemaVersion: 3,
      provider: { id: 'synthetic-a', revision: 'rev-1', timeZone: 'Asia/Almaty', coverage: {
        geographic: 'KZ-TEST', startDate: '2026-01-01', endDate: '2026-12-31',
      } },
      days: canonical.days.map(({ fajrJamaat: _jamaat, zenith: _zenith, ...day }, index) => index === 0
        ? { ...day, provenance: { fajrStart: 'published' as const } }
        : day),
    }
    expect(normalizeStoredPrayerDataset(providerDataset)).toEqual(providerDataset)
  })
})
