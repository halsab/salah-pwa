import { describe, expect, it } from 'vitest'
import { createCityPlace, createGpsPlace, createOfficialPlace, withNearbyCity } from './place'
import { initialManualCalculation, resolvePrayerTimeSource, type OfficialDatasetAvailability } from './prayerSource'
import { automaticPreferences, isSourcePreferences, manualCalculation, restoreSourcePreferences } from './sourcePreferences'
import { automaticCalculationDefaults, effectiveCalculationSettings, isCalculationSelection } from './calculationSettings'
import { calculatePrayerSchedule } from './prayerCalculation'
import { DUM_RT_TIME_ZONE } from './locationTime'

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
  it('starts first-time Manual with the calculated profile behind an available official table', () => {
    expect(initialManualCalculation(place, '2026-09-01', [official])).toMatchObject({ profile: 'dumRt', overrides: { asrMethod: 'hanafi' } })
  })
  it('starts first-time Manual with the effective regional profile and Asr method', () => {
    const moscow = { ...place, selection: 'city' as const, coverage: 'outside' as const, region: { code: 'RU.77', name: 'Москва' } }
    expect(initialManualCalculation(moscow, '2026-09-01', [official])).toMatchObject({ profile: 'dumRf', overrides: { asrMethod: 'standard', highLatitudeRule: 'seventhOfNight' } })
  })
  it('requires explicit profile selection when no supported automatic calculation is resolvable', () => {
    const saudi = { ...place, selection: 'city' as const, coverage: 'outside' as const, region: { code: 'SA.01', name: 'Эр-Рияд' } }
    expect(initialManualCalculation(saudi, '2026-09-01', [], [])).toBeUndefined()
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
  it.each([
    ['RU-TA', 'dumRt', 'hanafi', 'regional', 'gps', 'inside'],
    ['RU.48', 'dumRf', 'standard', 'regional', 'city', 'outside'],
    ['TR.34', 'turkey', 'standard', 'regional', 'city', 'outside'],
    ['PK.01', 'karachi', 'hanafi', 'regional', 'city', 'outside'],
    ['BD.81', 'karachi', 'hanafi', 'regional', 'city', 'outside'],
    ['IN.07', 'karachi', 'hanafi', 'regional', 'city', 'outside'],
    ['KZ.75', 'muslimWorldLeague', 'hanafi', 'regional', 'city', 'outside'],
    ['KG.01', 'muslimWorldLeague', 'hanafi', 'regional', 'city', 'outside'],
    ['UZ.13', 'muslimWorldLeague', 'hanafi', 'regional', 'city', 'outside'],
    ['US.CA', 'northAmerica', 'standard', 'regional', 'city', 'outside'],
    ['CA.ON', 'canadaFcna', 'standard', 'regional', 'city', 'outside'],
    ['SA.01', 'ummAlQura', 'standard', 'regional', 'city', 'outside'],
    ['AE.AZ', 'dubai', 'standard', 'regional', 'city', 'outside'],
    ['QA.01', 'qatar', 'standard', 'regional', 'city', 'outside'],
    ['KW.01', 'kuwait', 'standard', 'regional', 'city', 'outside'],
    ['EG.C', 'egyptian', 'standard', 'regional', 'city', 'outside'],
    ['ZA.11', 'muslimWorldLeague', 'standard', 'default', 'city', 'outside'],
    ['XX.1', 'muslimWorldLeague', 'standard', 'default', 'city', 'outside'],
  ] as const)('uses the approved automatic policy for %s', (code, profile, asrMethod, strategy, selection, coverage) => {
    const candidate = { ...place, selection, coverage, region: { code, name: '' } }
    const result = resolvePrayerTimeSource(candidate, '2026-09-01', auto, [], profile === 'ummAlQura' ? ['ummAlQura', 'muslimWorldLeague'] : undefined)
    expect(result).toMatchObject({ kind: 'calculated', strategy, settings: { profile, asrMethod } })
    expect(automaticCalculationDefaults(candidate)).toEqual({ profile, asrMethod })
  })
  it.each([
    ['Москва', '48', 55.75, 37.62],
    ['Уфа', '08', 54.74, 55.97],
    ['Владивосток', '59', 43.12, 131.89],
  ] as const)('выбирает ДУМ РФ для города %s вне Татарстана', (name, admin1Code, latitude, longitude) => {
    const city = createCityPlace({ id: 1, name, countryCode: 'RU', admin1Code, admin1Name: name, latitude, longitude, population: 1, timeZone: 'Europe/Moscow' }, 0)
    expect(resolvePrayerTimeSource(city, '2026-09-01', auto, [official])).toMatchObject({
      kind: 'calculated', strategy: 'regional', settings: { profile: 'dumRf', asrMethod: 'standard', highLatitudeRule: latitude > 48 ? 'seventhOfNight' : 'twilightAngle' },
    })
    expect(resolvePrayerTimeSource(city, '2026-09-01', manualCalculation({ profile: 'karachi', overrides: {} }), [official])).toMatchObject({ settings: { profile: 'karachi' }, strategy: 'manual' })
  })
  it('для города Татарстана сначала берёт таблицу, затем расчёт ДУМ РТ', () => {
    const city = createCityPlace({ id: 1, name: 'Казань', countryCode: 'RU', admin1Code: '73', admin1Name: 'Татарстан', latitude: 55.79, longitude: 49.12, population: 1, timeZone: 'Europe/Moscow' }, 0)
    expect(resolvePrayerTimeSource(city, '2026-09-01', auto, [official])).toMatchObject({ kind: 'official', provider: 'dumRt' })
    expect(resolvePrayerTimeSource(city, '2027-09-01', auto, [official])).toMatchObject({ kind: 'calculated', settings: { profile: 'dumRt', asrMethod: 'hanafi', highLatitudeRule: 'dumRt' } })
  })
  it('uses DUM RT for a GPS fix only when the existing geometry confirms Tatarstan', () => {
    const geometry = { uncertaintyMeters: 0, polygons: [[[[49, 55], [50, 55], [50, 56], [49, 56], [49, 55]]]] } as const
    const gps = createGpsPlace({ latitude: 55.5, longitude: 49.5, accuracy: 10, timestamp: 0 }, 'Europe/Moscow', geometry, 'gps:ta')
    expect(resolvePrayerTimeSource(gps, '2026-09-01', auto, [official])).toMatchObject({ kind: 'official', provider: 'dumRt' })
    expect(resolvePrayerTimeSource(gps, '2027-09-01', auto, [official])).toMatchObject({ kind: 'calculated', strategy: 'regional', settings: { profile: 'dumRt', asrMethod: 'hanafi' } })
  })
  it.each([
    ['RU', 'dumRf', 'standard'], ['TR', 'turkey', 'standard'], ['KZ', 'muslimWorldLeague', 'hanafi'],
    ['CA', 'canadaFcna', 'standard'], ['AE', 'dubai', 'standard'], ['ZZ', 'muslimWorldLeague', 'standard'],
  ] as const)('uses nearest-city country %s only for automatic profile selection', (countryCode, profile, asrMethod) => {
    const gps = createGpsPlace({ latitude: 55.75, longitude: 37.62, accuracy: 10, timestamp: 0 }, 'Europe/Moscow', null, 'gps:country')
    const city = withNearbyCity(gps, { id: 1, name: 'Nearest city', countryCode, admin1Code: '', admin1Name: '',
      latitude: gps.latitude, longitude: gps.longitude, population: 1, timeZone: 'Europe/Moscow' })
    expect(city).toMatchObject({ latitude: gps.latitude, longitude: gps.longitude, timeZone: 'Europe/Moscow' })
    const officialData = countryCode === 'RU' ? [official] : []
    expect(resolvePrayerTimeSource(city, '2026-09-01', auto, officialData)).toMatchObject({
      kind: 'calculated', strategy: countryCode === 'ZZ' ? 'default' : 'regional', settings: { profile, asrMethod },
    })
  })
  it('does not infer country from a label and uses MWL when nearest-city country is invalid', () => {
    const gps = createGpsPlace({ latitude: 55.75, longitude: 37.62, accuracy: 10, timestamp: 0 }, 'Europe/Moscow', null, 'gps:invalid-country')
    const named = withNearbyCity(gps, { id: 1, name: 'Москва', countryCode: 'ru', admin1Code: '', admin1Name: '',
      latitude: gps.latitude, longitude: gps.longitude, population: 1, timeZone: 'Europe/Moscow' })
    expect(resolvePrayerTimeSource(named, '2026-09-01', auto, [])).toMatchObject({
      kind: 'calculated', strategy: 'default', settings: { profile: 'muslimWorldLeague', asrMethod: 'standard' },
    })
  })
  it('keeps confirmed Tatarstan and official timetable priority regardless of nearest-city country', () => {
    const geometry = { uncertaintyMeters: 0, polygons: [[[[49, 55], [50, 55], [50, 56], [49, 56], [49, 55]]]] } as const
    const gps = createGpsPlace({ latitude: 55.5, longitude: 49.5, accuracy: 10, timestamp: 0 }, 'Europe/Moscow', geometry, 'gps:ta-cross-border')
    const withForeignCity = withNearbyCity(gps, { id: 1, name: 'Cross-border city', countryCode: 'CA', admin1Code: '', admin1Name: '',
      latitude: gps.latitude, longitude: gps.longitude, population: 1, timeZone: 'America/Toronto' })
    expect(resolvePrayerTimeSource(withForeignCity, '2026-09-01', auto, [official])).toMatchObject({ kind: 'official', provider: 'dumRt' })
    expect(resolvePrayerTimeSource(withForeignCity, '2027-09-01', auto, [official])).toMatchObject({
      kind: 'calculated', strategy: 'regional', settings: { profile: 'dumRt', asrMethod: 'hanafi' },
    })
    const outside = { ...withForeignCity, coverage: 'outside' as const, region: null }
    expect(resolvePrayerTimeSource(outside, '2026-09-01', auto, [official])).toMatchObject({
      kind: 'calculated', strategy: 'regional', settings: { profile: 'canadaFcna' },
    })
  })
  it('uses generic fallback when a regional profile is unsupported, without retaining regional Asr', () => {
    const toronto = { ...place, selection: 'city' as const, coverage: 'outside' as const, region: { code: 'CA.ON', name: '' } }
    expect(resolvePrayerTimeSource(toronto, '2026-09-01', auto, [], ['muslimWorldLeague']))
      .toMatchObject({ kind: 'calculated', strategy: 'default', status: 'ready', settings: { profile: 'muslimWorldLeague', asrMethod: 'standard' } })
    expect(resolvePrayerTimeSource(toronto, '2026-09-01', auto, [], ['turkey']))
      .toMatchObject({ kind: 'calculated', strategy: 'default', status: 'unsupported', settings: { profile: 'muslimWorldLeague', asrMethod: 'standard' } })
  })
  it('не выводит страну GPS из названия или зоны устройства и не использует недоступный профиль', () => {
    const gps = createGpsPlace({ latitude: 55.75, longitude: 37.62, accuracy: 10, timestamp: 0 }, 'Europe/Moscow', null, 'gps:1')
    expect(resolvePrayerTimeSource({ ...gps, name: 'Рядом: Москва' }, '2026-09-01', auto, [])).toMatchObject({ settings: { profile: 'muslimWorldLeague' }, strategy: 'default' })
    expect(resolvePrayerTimeSource({ ...place, region: { code: 'RU.48', name: 'Москва' }, coverage: 'outside' }, '2026-09-01', auto, [], ['muslimWorldLeague'])).toMatchObject({ settings: { profile: 'muslimWorldLeague' }, strategy: 'default' })
  })
  it('requires explicit capability for Umm al-Qura; unsupported manual profile remains unavailable', () => {
    const sa = { ...place, selection: 'city' as const, coverage: 'outside' as const, region: { code: 'SA.01', name: '' } }
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
  it('preserves calculation overrides across Automatic and Manual and restores effective settings', () => {
    const selection = { profile: 'karachi' as const, overrides: { asrMethod: 'standard' as const, fajrAngle: 19, adjustments: { isha: 90 } } }
    const switched = automaticPreferences(selection, { kind: 'calculated', calculation: selection })
    expect(resolvePrayerTimeSource(place, '2026-09-01', switched, [official])).toMatchObject({ kind: 'official', provider: 'dumRt' })
    const source = switched.manualSourceDraft
    if (source?.kind !== 'calculated') throw new Error('expected preserved manual calculation')
    const restored = { mode: 'manual' as const, source }
    expect(resolvePrayerTimeSource(place, '2026-09-01', restored, [official])).toMatchObject({ kind: 'calculated', strategy: 'manual', settings: { profile: 'karachi', asrMethod: 'standard', fajrAngle: 19, adjustments: { isha: 90 } } })
  })
  it('restores the pinned DUM RT source kind and provider after Automatic mode', () => {
    const saved = { mode: 'manual' as const, source: { kind: 'official' as const, provider: 'dumRt' }, calculationDraft: { profile: 'karachi' as const, overrides: { asrMethod: 'hanafi' as const } } }
    const automatic = automaticPreferences(saved.calculationDraft, saved.source)
    expect(resolvePrayerTimeSource(place, '2026-09-01', automatic, [official])).toMatchObject({ kind: 'official', provider: 'dumRt' })
    expect(automatic.manualSourceDraft).toEqual(saved.source)
    expect(resolvePrayerTimeSource(place, '2026-09-01', saved, [official])).toMatchObject({ kind: 'official', provider: 'dumRt', status: 'ready' })
  })
  it.each(['canadaFcna', 'dubai', 'qatar', 'kuwait', 'egyptian'] as const)(
    'allows manual calculation with the new profile %s', profile => {
      const result = resolvePrayerTimeSource(place, '2026-09-01', manualCalculation({ profile, overrides: {} }), [])
      expect(result).toMatchObject({ kind: 'calculated', status: 'ready', settings: { profile } })
    },
  )
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
  expect(resolvePrayerTimeSource(west, new Date('2025-12-31T22:00:00Z'), auto, [official])).toMatchObject({ kind: 'official', status: 'ready', timeZone: DUM_RT_TIME_ZONE })
  expect(resolvePrayerTimeSource(west, new Date('2026-12-31T22:00:00Z'), auto, [official])).toMatchObject({ kind: 'calculated' })
})
it('uses a confirmed local version ahead of a missing version regardless of descriptor order', () => {
  const missing = { ...official, state: 'not-loaded' as const, version: 'v2', revision: 'r2' }
  expect(resolvePrayerTimeSource(place, '2026-09-01', auto, [missing, official])).toMatchObject({ kind: 'official', status: 'ready', version: 'v1' })
})

it('uses exact inclusive date ranges for v3 datasets while retaining v2 year coverage', () => {
  const partial = { ...official, schemaVersion: 3, startDate: '2026-03-15', endDate: '2026-10-20' }
  expect(resolvePrayerTimeSource(place, '2026-03-14', auto, [partial])).toMatchObject({ kind: 'calculated' })
  expect(resolvePrayerTimeSource(place, '2026-03-15', auto, [partial])).toMatchObject({ kind: 'official', status: 'ready' })
  expect(resolvePrayerTimeSource(place, '2026-10-20', auto, [partial])).toMatchObject({ kind: 'official', status: 'ready' })
  expect(resolvePrayerTimeSource(place, '2026-10-21', auto, [partial])).toMatchObject({ kind: 'calculated' })
  expect(resolvePrayerTimeSource(place, '2026-12-31', auto, [official])).toMatchObject({ kind: 'official', status: 'ready' })
  expect(resolvePrayerTimeSource(place, '2026-02-30', auto, [official])).toMatchObject({ kind: 'calculated' })
  const wrongZone = { ...partial, timeZone: 'America/Los_Angeles' }
  expect(resolvePrayerTimeSource(place, new Date('2026-03-15T00:30:00Z'), auto, [wrongZone])).toMatchObject({ kind: 'official', timeZone: DUM_RT_TIME_ZONE })
  expect(resolvePrayerTimeSource(place, '2026-03-15', auto, [wrongZone])).toMatchObject({ kind: 'official', timeZone: DUM_RT_TIME_ZONE })
})

it('uses Moscow date at midnight when device date is still the previous day', () => {
  const instant = new Date('2026-01-01T00:30:00.000Z')
  const partial = { ...official, schemaVersion: 3, startDate: '2026-01-01', endDate: '2026-12-31' }
  expect(resolvePrayerTimeSource(place, instant, auto, [partial])).toMatchObject({ kind: 'official', status: 'ready', timeZone: DUM_RT_TIME_ZONE })
})

it('applies the automatic Asr school to calculated prayer times', () => {
  const almaty = { ...place, selection: 'city' as const, coverage: 'outside' as const, latitude: 43.2383, longitude: 76.9455, timeZone: 'Asia/Almaty', region: { code: 'KZ.75', name: '' } }
  const resolution = resolvePrayerTimeSource(almaty, '2026-09-01', auto, [])
  expect(resolution).toMatchObject({ kind: 'calculated', strategy: 'regional', settings: { profile: 'muslimWorldLeague', asrMethod: 'hanafi' } })
  if (resolution.kind !== 'calculated') throw new Error('expected calculated source')
  const automatic = calculatePrayerSchedule(almaty, '2026-09-01', almaty.timeZone, resolution.settings)
  const standard = calculatePrayerSchedule(almaty, '2026-09-01', almaty.timeZone, { ...resolution.settings, asrMethod: 'standard' })
  expect(automatic.entries.asr.instant).not.toBe(standard.entries.asr.instant)
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
