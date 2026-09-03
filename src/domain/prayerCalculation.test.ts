import { describe, expect, it } from 'vitest'

import {
  CALCULATION_PROFILES,
  DEFAULT_CALCULATION_SETTINGS,
  calculatePrayerSchedule,
  type CalculationSettings,
} from './prayerCalculation'

const KAZAN = { latitude: 55.7946485, longitude: 49.1115022 }
const MINUTE = 60_000

function withSettings(
  settings: Partial<CalculationSettings>,
): CalculationSettings {
  return { ...DEFAULT_CALCULATION_SETTINGS, ...settings }
}

describe('calculatePrayerSchedule', () => {
  it('считает зимний день по профилю ДУМ РТ без северной подстановки', () => {
    const schedule = calculatePrayerSchedule(KAZAN, '2026-01-15')

    expect(Object.keys(schedule.entries)).toEqual([
      'fajr',
      'sunrise',
      'zenith',
      'dhuhr',
      'asr',
      'maghrib',
      'isha',
    ])
    expect(schedule.estimatedPrayers).toEqual([])
    expect(schedule.polarResolutionApplied).toBe(false)
    expect(schedule.entries.fajr.instant).toBeLessThan(
      schedule.entries.sunrise.instant,
    )
    expect(schedule.entries.isha.instant).toBeGreaterThan(
      schedule.entries.maghrib.instant,
    )
  })

  it('летом применяет правило ДУМ РТ 120/90 только к Фаджру и Иша', () => {
    const schedule = calculatePrayerSchedule(KAZAN, '2026-06-15')

    expect(schedule.estimatedPrayers).toEqual(['fajr', 'isha'])
    expect(schedule.entries.sunrise.instant - schedule.entries.fajr.instant).toBeGreaterThanOrEqual(
      120 * MINUTE,
    )
    expect(schedule.entries.sunrise.instant - schedule.entries.fajr.instant).toBeLessThanOrEqual(
      121 * MINUTE,
    )
    expect(schedule.entries.isha.instant - schedule.entries.maghrib.instant).toBe(
      90 * MINUTE,
    )
  })

  it('сохраняет астрономические времена у границы летнего правила', () => {
    const direct = calculatePrayerSchedule(KAZAN, '2026-05-01')
    const firstEveningFallback = calculatePrayerSchedule(KAZAN, '2026-05-05')
    const adjusted = calculatePrayerSchedule(KAZAN, '2026-05-15')
    const lastMorningFallback = calculatePrayerSchedule(KAZAN, '2026-08-08')
    const restored = calculatePrayerSchedule(KAZAN, '2026-08-09')

    expect(direct.estimatedPrayers).not.toContain('fajr')
    expect(firstEveningFallback.estimatedPrayers).toEqual(['isha'])
    expect(adjusted.estimatedPrayers).toContain('fajr')
    expect(lastMorningFallback.estimatedPrayers).toEqual(['fajr'])
    expect(restored.estimatedPrayers).not.toContain('fajr')
  })

  it('делает стандартный Аср раньше ханафитского', () => {
    const hanafi = calculatePrayerSchedule(KAZAN, '2026-09-01')
    const standard = calculatePrayerSchedule(
      KAZAN,
      '2026-09-01',
      withSettings({ asrMethod: 'standard' }),
    )

    expect(standard.entries.asr.instant).toBeLessThan(hanafi.entries.asr.instant)
  })

  it('поддерживает все заявленные профили, включая Турцию · Diyanet', () => {
    for (const profile of CALCULATION_PROFILES) {
      const schedule = calculatePrayerSchedule(
        { latitude: 41.0082, longitude: 28.9784 },
        '2026-09-01',
        withSettings({ profile: profile.id }),
      )

      expect(schedule.profile).toBe(profile.id)
      for (const entry of Object.values(schedule.entries)) {
        expect(Number.isFinite(entry.instant)).toBe(true)
      }
    }
  })

  it('считает профиль ДУМ РФ по углам 16°/15°', () => {
    const dumRf = calculatePrayerSchedule(
      KAZAN,
      '2026-01-15',
      withSettings({ profile: 'dumRf' }),
    )
    const dumRt = calculatePrayerSchedule(KAZAN, '2026-01-15')
    const isna = calculatePrayerSchedule(
      KAZAN,
      '2026-01-15',
      withSettings({ profile: 'northAmerica' }),
    )

    expect(CALCULATION_PROFILES).toContainEqual({ id: 'dumRf', label: 'ДУМ РФ' })
    expect(dumRf.profile).toBe('dumRf')
    expect(dumRf.entries.fajr.instant).toBeGreaterThan(dumRt.entries.fajr.instant)
    expect(dumRf.entries.fajr.instant).toBeLessThan(isna.entries.fajr.instant)
    expect(dumRf.entries.isha.instant).toBe(isna.entries.isha.instant)
  })

  it('восстанавливает полярный день и возвращает упорядоченное расписание', () => {
    const schedule = calculatePrayerSchedule(
      { latitude: 69.6492, longitude: 18.9553 },
      '2026-06-21',
    )
    const instants = [
      schedule.entries.fajr.instant,
      schedule.entries.sunrise.instant,
      schedule.entries.dhuhr.instant,
      schedule.entries.asr.instant,
      schedule.entries.maghrib.instant,
      schedule.entries.isha.instant,
    ]

    expect(schedule.polarResolutionApplied).toBe(true)
    expect(instants.every(Number.isFinite)).toBe(true)
    expect([...instants].sort((a, b) => a - b)).toEqual(instants)
  })

  it('поддерживает правило ближайшего дня для полярной местности', () => {
    const schedule = calculatePrayerSchedule(
      { latitude: 78.2232, longitude: 15.6469 },
      '2026-12-21',
      withSettings({ highLatitudeRule: 'nearestDay' }),
    )

    expect(schedule.polarResolutionApplied).toBe(true)
    expect(Number.isFinite(schedule.entries.sunrise.instant)).toBe(true)
    expect(Number.isFinite(schedule.entries.maghrib.instant)).toBe(true)
  })
})
