import { describe, expect, it } from 'vitest'
import { createCityPlace, createGpsPlace, createLocalityPlace, withNearbyCity } from './place'
import { initialManualCalculation, resolvePrayerTimeSource } from './prayerSource'
import { automaticPreferences, isSourcePreferences, manualCalculation, restoreSourcePreferences } from './sourcePreferences'
import { automaticCalculationDefaults, effectiveCalculationSettings, isCalculationSelection } from './calculationSettings'
import { calculatePrayerSchedule } from './prayerCalculation'

const kazan = createLocalityPlace({ id: 'kazan', name: 'Казань', latitude: 55.79, longitude: 49.12 }, 0)
const automatic = automaticPreferences()

describe('calculation source resolver', () => {
  it('uses the independent Tatarstan profile for confirmed localities in every year', () => {
    const resolution = resolvePrayerTimeSource(kazan, automatic)
    expect(resolution).toMatchObject({
        kind: 'calculated', status: 'ready', timeZone: 'Europe/Moscow', settings: { profile: 'tatarstan', asrMethod: 'hanafi' },
    })
    for (const date of ['2026-06-21', '2027-06-21', '2030-06-21']) {
      expect(calculatePrayerSchedule(kazan, date, resolution.timeZone, resolution.settings).date).toBe(date)
    }
    expect(initialManualCalculation(kazan)).toMatchObject({ profile: 'tatarstan', overrides: { asrMethod: 'hanafi' } })
  })

  it.each([
    ['RU.48', 'russia', 'standard', 55.75],
    ['RU.02', 'russia', 'standard', 54.74],
    ['TR.34', 'turkey', 'standard', 41.01],
    ['PK.01', 'karachi', 'hanafi', 33.69],
    ['US.CA', 'northAmerica', 'standard', 37.77],
    ['CA.ON', 'canadaFcna', 'standard', 43.65],
    ['SA.01', 'ummAlQura', 'standard', 24.71],
    ['XX.1', 'muslimWorldLeague', 'standard', 0],
  ] as const)('retains automatic regional mapping %s -> %s', (code, profile, asrMethod, latitude) => {
    const candidate = { ...kazan, id: 'geonames:1', selection: 'city' as const, coverage: 'outside' as const,
      latitude, region: { code, name: '' } }
    const result = resolvePrayerTimeSource(candidate, automatic)
    expect(result).toMatchObject({ kind: 'calculated', status: 'ready', strategy: code === 'XX.1' ? 'default' : 'regional', settings: { profile, asrMethod } })
    expect(automaticCalculationDefaults(candidate)).toEqual({ profile, asrMethod })
  })

  it.each([
    ['Москва', '48', 55.75, 37.62],
    ['Уфа', '02', 54.74, 55.97],
    ['Владивосток', '59', 43.12, 131.89],
  ] as const)('uses the Russia profile for %s without changing manual defaults', (name, admin1Code, latitude, longitude) => {
    const city = createCityPlace({ id: 1, name, countryCode: 'RU', admin1Code, admin1Name: name,
      latitude, longitude, population: 1, timeZone: 'Europe/Moscow' }, 0)
    expect(resolvePrayerTimeSource(city, automatic)).toMatchObject({
      kind: 'calculated', strategy: 'regional', settings: { profile: 'russia', asrMethod: 'standard', highLatitudeRule: latitude > 48 ? 'seventhOfNight' : 'twilightAngle' },
    })
    expect(resolvePrayerTimeSource(city, manualCalculation({ profile: 'russia', overrides: {} })))
      .toMatchObject({ settings: { profile: 'russia', asrMethod: 'hanafi' }, strategy: 'manual' })
  })

  it('uses Tatarstan geography for a confirmed GPS point and ignores a nearby foreign-city label', () => {
    const geometry = { uncertaintyMeters: 0, polygons: [[[[49, 55], [50, 55], [50, 56], [49, 56], [49, 55]]]] } as const
    const gps = createGpsPlace({ latitude: 55.5, longitude: 49.5, accuracy: 10, timestamp: 0 }, 'Europe/Moscow', geometry, 'gps:ta')
    const foreignLabel = withNearbyCity(gps, { id: 1, name: 'Nearby', countryCode: 'CA', admin1Code: '', admin1Name: '',
      latitude: gps.latitude, longitude: gps.longitude, population: 1, timeZone: 'America/Toronto' })
    expect(resolvePrayerTimeSource(foreignLabel, automatic)).toMatchObject({ settings: { profile: 'tatarstan' } })
    expect(resolvePrayerTimeSource({ ...gps, coverage: 'outside', region: null }, automatic)).toMatchObject({ settings: { profile: 'muslimWorldLeague' } })
  })

  it('uses a generic profile if an automatic regional profile is unavailable', () => {
    const moscow = { ...kazan, selection: 'city' as const, coverage: 'outside' as const, region: { code: 'RU.48', name: 'Москва' } }
    expect(resolvePrayerTimeSource(moscow, automatic, ['muslimWorldLeague'])).toMatchObject({
      kind: 'calculated', strategy: 'default', status: 'ready', settings: { profile: 'muslimWorldLeague', asrMethod: 'standard' },
    })
    expect(resolvePrayerTimeSource(moscow, automatic, ['turkey'])).toMatchObject({
      kind: 'calculated', strategy: 'default', status: 'unsupported', settings: { profile: 'muslimWorldLeague' },
    })
  })

  it('keeps manual calculation overrides and the automatic draft independent', () => {
    const selection = { profile: 'karachi' as const, overrides: { asrMethod: 'standard' as const, fajrAngle: 19, adjustments: { isha: 90 } } }
    const manual = resolvePrayerTimeSource(kazan, manualCalculation(selection))
    expect(manual).toMatchObject({ kind: 'calculated', strategy: 'manual', settings: { profile: 'karachi', fajrAngle: 19, adjustments: { isha: 90 } } })
    expect(resolvePrayerTimeSource(kazan, automaticPreferences(selection)).settings.profile).toBe('tatarstan')
    expect(resolvePrayerTimeSource(kazan, automaticPreferences(selection, { kind: 'calculated', calculation: selection })).settings.profile).toBe('tatarstan')
    expect(resolvePrayerTimeSource(kazan, { mode: 'manual', source: { kind: 'calculated', calculation: selection } }).settings.asrMethod).toBe('standard')
  })

  it('resets incompatible official choices rather than importing unrelated calculation drafts', () => {
    const legacy = { mode: 'manual', source: { kind: 'official', provider: 'dumRt' },
      calculationDraft: { profile: 'karachi', overrides: { isha: { kind: 'interval', minutes: 100 } } } }
    expect(isSourcePreferences(legacy)).toBe(false)
    expect(restoreSourcePreferences(legacy)).toEqual(automatic)
    expect(resolvePrayerTimeSource(kazan, restoreSourcePreferences(legacy)).settings.profile).toBe('tatarstan')
  })

  it('retains new calculation profiles and overrides across restore', () => {
    const preferences = manualCalculation({ profile: 'russia', overrides: { asrMethod: 'standard', adjustments: { dhuhr: 2 } } })
    expect(restoreSourcePreferences(preferences)).toEqual(preferences)
    expect(restoreSourcePreferences({ mode: 'manual', source: { kind: 'calculated',
      calculation: { profile: 'dumRt', overrides: {} } } })).toEqual(automatic)
  })

  it('applies automatic Asr settings to calculated prayer instants', () => {
    const almaty = { ...kazan, selection: 'city' as const, coverage: 'outside' as const, latitude: 43.2383,
      longitude: 76.9455, timeZone: 'Asia/Almaty', region: { code: 'KZ.75', name: '' } }
    const resolution = resolvePrayerTimeSource(almaty, automatic)
    expect(resolution.settings).toMatchObject({ profile: 'muslimWorldLeague', asrMethod: 'hanafi' })
    const automaticSchedule = calculatePrayerSchedule(almaty, '2026-09-01', almaty.timeZone, resolution.settings)
    const standardSchedule = calculatePrayerSchedule(almaty, '2026-09-01', almaty.timeZone, { ...resolution.settings, asrMethod: 'standard' })
    expect(automaticSchedule.entries.asr.instant).not.toBe(standardSchedule.entries.asr.instant)
  })
})

describe('calculation preference validation', () => {
  it('uses automatic mode for new users and unsupported legacy profiles', () => {
    expect(restoreSourcePreferences(undefined)).toEqual(automatic)
    expect(restoreSourcePreferences({ mode: 'manual', source: { kind: 'calculated',
      calculation: { profile: 'dumRt', overrides: {} } } })).toEqual(automatic)
    expect(restoreSourcePreferences({ mode: 'manual', source: { kind: 'calculated',
      calculation: { profile: 'dumRf', overrides: {} } } })).toEqual(automatic)
  })

  it.each([
    { fajrAngle: NaN }, { fajrAngle: 0 }, { fajrAngle: 31 }, { isha: { kind: 'interval', minutes: Infinity } },
    { adjustments: { fajr: 181 } }, { adjustments: { suhurEnd: 2 } }, { asrMethod: 'unknown' },
  ])('rejects invalid expert overrides %j', overrides => expect(isCalculationSelection({ profile: 'karachi', overrides })).toBe(false))

  it('restores profile defaults separately from explicit overrides', () => {
    const selection = { profile: 'turkey' as const, overrides: { asrMethod: 'hanafi' as const, isha: { kind: 'interval' as const, minutes: 100 } } }
    expect(effectiveCalculationSettings(selection)).toMatchObject({ profile: 'turkey', asrMethod: 'hanafi', isha: { kind: 'interval', minutes: 100 } })
    expect(selection.overrides).not.toHaveProperty('fajrAngle')
  })
})
