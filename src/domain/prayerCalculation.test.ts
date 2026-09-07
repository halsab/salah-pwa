import { describe, expect, it, vi } from 'vitest'

import { getZonedTime } from './locationTime'
import {
  CALCULATION_PROFILES,
  UnsupportedCalculationProfileError,
  calculatePrayerSchedule,
  getCalculationProfileCapability,
  type CalculationSettings,
} from './prayerCalculation'

const KAZAN = { latitude: 55.7946485, longitude: 49.1115022 }
const MECCA = { latitude: 21.4225, longitude: 39.8262 }
const MINUTE = 60_000

function withSettings(
  settings: Partial<CalculationSettings>,
): CalculationSettings {
  return { profile: 'dumRt', asrMethod: 'hanafi', highLatitudeRule: 'dumRt', ...settings }
}

describe('calculatePrayerSchedule', () => {
  it('считает зимний день по профилю ДУМ РТ без северной подстановки', () => {
    const schedule = calculatePrayerSchedule(
      KAZAN,
      '2026-01-15',
      'Europe/Moscow',
      withSettings({}),
    )

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
    const schedule = calculatePrayerSchedule(
      KAZAN,
      '2026-06-15',
      'Europe/Moscow',
      withSettings({}),
    )

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
    const direct = calculatePrayerSchedule(
      KAZAN,
      '2026-05-01',
      'Europe/Moscow',
      withSettings({}),
    )
    const firstEveningFallback = calculatePrayerSchedule(
      KAZAN,
      '2026-05-05',
      'Europe/Moscow',
      withSettings({}),
    )
    const adjusted = calculatePrayerSchedule(
      KAZAN,
      '2026-05-15',
      'Europe/Moscow',
      withSettings({}),
    )
    const lastMorningFallback = calculatePrayerSchedule(
      KAZAN,
      '2026-08-08',
      'Europe/Moscow',
      withSettings({}),
    )
    const restored = calculatePrayerSchedule(
      KAZAN,
      '2026-08-09',
      'Europe/Moscow',
      withSettings({}),
    )

    expect(direct.estimatedPrayers).not.toContain('fajr')
    expect(firstEveningFallback.estimatedPrayers).toEqual(['isha'])
    expect(adjusted.estimatedPrayers).toContain('fajr')
    expect(lastMorningFallback.estimatedPrayers).toEqual(['fajr'])
    expect(restored.estimatedPrayers).not.toContain('fajr')
  })

  it('делает стандартный Аср раньше ханафитского', () => {
    const hanafi = calculatePrayerSchedule(
      KAZAN,
      '2026-09-01',
      'Europe/Moscow',
      withSettings({}),
    )
    const standard = calculatePrayerSchedule(
      KAZAN,
      '2026-09-01',
      'Europe/Moscow',
      withSettings({ asrMethod: 'standard' }),
    )

    expect(standard.entries.asr.instant).toBeLessThan(hanafi.entries.asr.instant)
  })

  it('поддерживает все заявленные профили, включая Турцию · Diyanet', () => {
    for (const profile of CALCULATION_PROFILES) {
      const schedule = calculatePrayerSchedule(
        { latitude: 41.0082, longitude: 28.9784 },
        '2026-09-01',
        'Europe/Istanbul',
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
      'Europe/Moscow',
      withSettings({ profile: 'dumRf' }),
    )
    const dumRt = calculatePrayerSchedule(
      KAZAN,
      '2026-01-15',
      'Europe/Moscow',
      withSettings({}),
    )
    const isna = calculatePrayerSchedule(
      KAZAN,
      '2026-01-15',
      'Europe/Moscow',
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
      'Europe/Oslo',
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
      'Arctic/Longyearbyen',
      withSettings({ highLatitudeRule: 'nearestDay' }),
    )

    expect(schedule.polarResolutionApplied).toBe(true)
    expect(Number.isFinite(schedule.entries.sunrise.instant)).toBe(true)
    expect(Number.isFinite(schedule.entries.maghrib.instant)).toBe(true)
  })

  it('форматирует те же рассчитанные моменты в выбранной таймзоне', () => {
    const moscow = calculatePrayerSchedule(KAZAN, '2026-01-15', 'Europe/Moscow')
    const tokyo = calculatePrayerSchedule(KAZAN, '2026-01-15', 'Asia/Tokyo')

    expect(tokyo.entries.fajr.instant).toBe(moscow.entries.fajr.instant)
    expect(moscow.entries.fajr.time).toBe(
      getZonedTime(new Date(moscow.entries.fajr.instant), 'Europe/Moscow'),
    )
    expect(tokyo.entries.fajr.time).toBe(
      getZonedTime(new Date(tokyo.entries.fajr.instant), 'Asia/Tokyo'),
    )
    expect(tokyo.entries.fajr.time).not.toBe(moscow.entries.fajr.time)
  })

  it('использует интервал Иша 120 минут в Рамадан и 90 минут вне Рамадана', () => {
    const settings = withSettings({ profile: 'ummAlQura' })
    const ramadan = calculatePrayerSchedule(
      MECCA,
      '2026-02-18',
      'Asia/Riyadh',
      settings,
    )
    const outsideRamadan = calculatePrayerSchedule(
      MECCA,
      '2026-03-20',
      'Asia/Riyadh',
      settings,
    )

    expect(ramadan.entries.isha.instant - ramadan.entries.maghrib.instant).toBe(
      120 * MINUTE,
    )
    expect(
      outsideRamadan.entries.isha.instant - outsideRamadan.entries.maghrib.instant,
    ).toBe(90 * MINUTE)
  })

  it('явно отклоняет Умм аль-Кура, если точный календарь недоступен', () => {
    const reason =
      'Профиль «Умм аль-Кура» недоступен: календарь islamic-umalqura не поддерживается этим браузером.'
    const resolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(
      function (this: Intl.DateTimeFormat) {
        return { ...resolvedOptions.call(this), calendar: 'gregory' }
      },
    )

    expect(getCalculationProfileCapability('ummAlQura')).toEqual({
      supported: false,
      reason,
    })
    let thrown: unknown
    try {
      calculatePrayerSchedule(
        MECCA,
        '2026-02-18',
        'Asia/Riyadh',
        withSettings({ profile: 'ummAlQura' }),
      )
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(UnsupportedCalculationProfileError)
    expect(thrown).toMatchObject({ profile: 'ummAlQura', message: reason })
  })
})

it('applies adjustments to absolute instants across midnight and countdown chronology', async () => {
  const { buildScheduleEvents, selectEventPair } = await import('./scheduleEvents')
  const place = { latitude: 55.79, longitude: 49.12 }
  const baseline = calculatePrayerSchedule(place, '2026-06-21', 'Europe/Moscow', withSettings({}))
  const adjusted = calculatePrayerSchedule(place, '2026-06-21', 'Europe/Moscow', withSettings({ adjustments: { isha: 180, fajr: -180 } }))
  expect(adjusted.entries.isha.instant).toBe(baseline.entries.isha.instant + 180 * MINUTE)
  expect(adjusted.entries.fajr.instant).toBe(baseline.entries.fajr.instant - 180 * MINUTE)
  expect(adjusted.estimatedPrayers).toEqual(baseline.estimatedPrayers)
  const events = buildScheduleEvents(adjusted)
  expect(events.find(e => e.key === 'isha')).toMatchObject({ date: '2026-06-22', dayOffset: 1 })
  expect(events.find(e => e.key === 'fajr')).toMatchObject({ date: '2026-06-20', dayOffset: -1 })
  const instant = adjusted.entries.isha.instant
  expect(selectEventPair(new Date(instant - 1000), events).next?.instant).toBe(instant)
  expect(selectEventPair(new Date(instant), events).current?.key).toBe('isha')
})
it('applies explicit angles and Isha interval while retaining profile and polar rules', () => {
  const base = withSettings({ profile: 'turkey', highLatitudeRule: 'nearestDay' })
  const original = calculatePrayerSchedule(MECCA, '2026-01-15', 'Asia/Riyadh', base)
  const angles = calculatePrayerSchedule(MECCA, '2026-01-15', 'Asia/Riyadh', { ...base, fajrAngle: 20, isha: { kind: 'angle', angle: 20 } })
  expect(angles.entries.fajr.instant).toBeLessThan(original.entries.fajr.instant)
  expect(angles.entries.isha.instant).toBeGreaterThan(original.entries.isha.instant)
  for (const place of [MECCA, { latitude: 69.65, longitude: 18.96 }]) {
    const interval = calculatePrayerSchedule(place, '2026-06-21', 'Europe/Oslo', { ...base, isha: { kind: 'interval', minutes: 240 } })
    expect(interval.entries.isha.instant - interval.entries.maghrib.instant).toBe(240 * MINUTE)
    expect(Object.values(interval.entries).every(e => Number.isFinite(e.instant))).toBe(true)
  }
})
it('rejects non-finite custom settings before generating an invalid instant', () => {
  expect(() => calculatePrayerSchedule(KAZAN, '2026-01-01', 'Europe/Moscow', withSettings({ adjustments: { fajr: Infinity } }))).toThrow('Некорректные параметры')
})
