import { describe, expect, it } from 'vitest'
import { createOfficialPlace } from './place'
import { resolvePrayerTimeSource, type OfficialDatasetAvailability } from './prayerSource'
import { automaticPreferences, isSourcePreferences, manualCalculation, restoreSourcePreferences } from './sourcePreferences'
import { effectiveCalculationSettings, isCalculationSelection } from './calculationSettings'

const place = createOfficialPlace({ id: 'kazan', name: 'Казань', latitude: 55.79, longitude: 49.12 }, 0)
const official: OfficialDatasetAvailability = {
  provider: 'dumRt', priority: 10, timeZone: 'Europe/Moscow', coverage: 'RU-TA',
  years: [2026], locations: [{ id: 'kazan', name: 'Казань', latitude: 55.79, longitude: 49.12 }],
  state: 'ready', version: 'v1', revision: 'r1',
}
const auto = automaticPreferences()

describe('source resolver', () => {
  it('selects covered official identity independently of network and ignores expert drafts', () => {
    const result = resolvePrayerTimeSource(place, '2026-09-01', auto, [official])
    expect(result).toMatchObject({ kind: 'official', status: 'ready', provider: 'dumRt', version: 'v1', locationId: 'kazan', timeZone: 'Europe/Moscow' })
    expect(resolvePrayerTimeSource(place, '2026-09-01', automaticPreferences({ profile: 'karachi', overrides: {} }), [official])).toEqual(result)
  })
  it('does not turn expected official coverage into calculation when missing or corrupt', () => {
    for (const state of ['not-loaded', 'invalid'] as const) {
      expect(resolvePrayerTimeSource(place, '2026-09-01', auto, [{ ...official, state }])).toMatchObject({ kind: 'official', status: state })
    }
  })
  it('falls back on expiration but manual official reports missing coverage', () => {
    expect(resolvePrayerTimeSource(place, '2027-01-01', auto, [official])).toMatchObject({ kind: 'calculated', settings: { profile: 'dumRt' } })
    expect(resolvePrayerTimeSource(place, '2027-01-01', { mode: 'manual', source: { kind: 'official', provider: 'dumRt' } }, [official])).toMatchObject({ kind: 'official', status: 'not-covered' })
  })
  it('uses an explicit priority and provider id tie break regardless of array order', () => {
    const other = { ...official, provider: 'aaa', priority: 5 }
    expect(resolvePrayerTimeSource(place, '2026-09-01', auto, [official, other])).toEqual(resolvePrayerTimeSource(place, '2026-09-01', auto, [other, official]))
    expect(resolvePrayerTimeSource(place, '2026-09-01', auto, [official, other])).toMatchObject({ provider: 'aaa' })
    expect(resolvePrayerTimeSource(place, '2026-09-01', auto, [official, { ...other, priority: 10 }])).toMatchObject({ provider: 'aaa' })
  })
  it.each([['TR.34', 'turkey'], ['PK.01', 'karachi'], ['US.CA', 'northAmerica'], ['RU.48', 'muslimWorldLeague'], ['XX.1', 'muslimWorldLeague']])('chooses supported regional default %s', (code, profile) => {
    expect(resolvePrayerTimeSource({ ...place, coverage: 'outside', region: { code, name: '' } }, '2026-09-01', auto, [official])).toMatchObject({ kind: 'calculated', settings: { profile } })
  })
  it('requires explicit capability for Umm al-Qura; unsupported manual profile remains unavailable', () => {
    const sa = { ...place, coverage: 'outside' as const, region: { code: 'SA.01', name: '' } }
    expect(resolvePrayerTimeSource(sa, '2026-09-01', auto, []).kind).toBe('calculated')
    expect(resolvePrayerTimeSource(sa, '2026-09-01', auto, [])).toMatchObject({ settings: { profile: 'muslimWorldLeague' } })
    expect(resolvePrayerTimeSource(sa, '2026-09-01', auto, [], ['ummAlQura', 'muslimWorldLeague'])).toMatchObject({ settings: { profile: 'ummAlQura' } })
    expect(resolvePrayerTimeSource(sa, '2026-09-01', manualCalculation({ profile: 'ummAlQura', overrides: {} }), [])).toMatchObject({ kind: 'calculated', status: 'unsupported' })
  })
  it('manual expert settings override official; auto removes their effect and keeps the draft', () => {
    const selection = { profile: 'karachi' as const, overrides: { fajrAngle: 19, adjustments: { isha: 90 } } }
    expect(resolvePrayerTimeSource(place, '2026-09-01', manualCalculation(selection), [official])).toMatchObject({ kind: 'calculated', settings: { profile: 'karachi', fajrAngle: 19, adjustments: { isha: 90 } } })
    expect(resolvePrayerTimeSource(place, '2026-09-01', automaticPreferences(selection), [official]).kind).toBe('official')
  })
})

describe('preferences and validation', () => {
  it('new user is automatic; any stored legacy settings preserve conscious or ambiguous choice', () => {
    expect(restoreSourcePreferences(undefined, undefined)).toEqual(auto)
    const legacy = { profile: 'dumRt', asrMethod: 'hanafi', highLatitudeRule: 'dumRt' }
    expect(restoreSourcePreferences(undefined, legacy)).toMatchObject({ mode: 'manual', source: { kind: 'calculated', calculation: { profile: 'dumRt' } } })
    expect(restoreSourcePreferences(undefined, legacy, { mode: 'official' })).toMatchObject({ mode: 'manual', source: { kind: 'official', provider: 'dumRt' }, calculationDraft: { profile: 'dumRt' } })
  })
  it.each([
    { fajrAngle: NaN }, { fajrAngle: 0 }, { fajrAngle: 31 },
    { isha: { kind: 'angle', angle: 15, minutes: 90 } },
    { isha: { kind: 'interval', minutes: Infinity } },
    { isha: { kind: 'interval', minutes: 0 } },
    { adjustments: { fajr: 181 } }, { adjustments: { fajr: 0.5 } },
    { adjustments: { suhurEnd: 2 } }, { unknown: 1 },
    { asrMethod: 'unknown' }, { highLatitudeRule: 7 },
    { isha: null }, { isha: { kind: 'angle', angle: 0 } },
    { isha: { kind: 'interval', minutes: 90, angle: 15 } },
    { isha: { kind: 'unknown' } }, { adjustments: [] },
  ])('rejects invalid expert overrides %j', (overrides) => {
    expect(isCalculationSelection({ profile: 'karachi', overrides })).toBe(false)
  })
  it('retains profile defaults separately from explicit overrides', () => {
    const selection = { profile: 'turkey' as const, overrides: { asrMethod: 'hanafi' as const, isha: { kind: 'interval' as const, minutes: 100 } } }
    expect(isCalculationSelection(selection)).toBe(true)
    expect(effectiveCalculationSettings(selection)).toMatchObject({ profile: 'turkey', asrMethod: 'hanafi', highLatitudeRule: 'twilightAngle', isha: { kind: 'interval', minutes: 100 } })
    expect(selection.overrides).not.toHaveProperty('fajrAngle')
  })
})

it('uses the provider calendar year near midnight regardless of a manual place timezone', () => {
  const west = { ...place, timeZone: 'America/Los_Angeles' }
  expect(resolvePrayerTimeSource(west, new Date('2025-12-31T22:00:00Z'), auto, [official])).toMatchObject({ kind: 'official', status: 'ready' })
  expect(resolvePrayerTimeSource(west, new Date('2026-12-31T22:00:00Z'), auto, [official])).toMatchObject({ kind: 'calculated' })
})
it('uses a confirmed local version ahead of a missing version regardless of descriptor order', () => {
  const missing = { ...official, state: 'not-loaded' as const, version: 'v2', revision: 'r2' }
  expect(resolvePrayerTimeSource(place, '2026-09-01', auto, [missing, official])).toMatchObject({ kind: 'official', status: 'ready', version: 'v1' })
})

it('rejects corrupt saved preferences and never turns invalid expert drafts into effective settings', () => {
  for (const value of [null, [], { mode: 'manual' }, { mode: 'automatic', calculationDraft: {} }, { mode: 'manual', source: { kind: 'official', provider: '' } }]) {
    expect(isSourcePreferences(value)).toBe(false)
    expect(restoreSourcePreferences(value)).toEqual(auto)
  }
  const invalid = { profile: 'karachi' as const, overrides: { fajrAngle: NaN } }
  expect(() => effectiveCalculationSettings(invalid)).toThrow(RangeError)
  expect(() => manualCalculation(invalid)).toThrow(RangeError)
})
