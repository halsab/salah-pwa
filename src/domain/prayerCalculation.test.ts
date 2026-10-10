import { describe, expect, it, vi } from 'vitest'
import { CalculationMethod, Coordinates, HighLatitudeRule, PolarCircleResolution, PrayerTimes } from 'adhan'

import { getZonedTime, zonedDateTimeToInstant } from './locationTime'
import { addDays } from './date'
import {
  CALCULATION_PROFILES,
  UnsupportedCalculationProfileError,
  calculatePrayerSchedule,
  calculateSolarZenith,
  getCalculationProfileCapability,
  getEffectiveParameters,
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

  it.each([
    ['canadaFcna', 13, 13, 0],
    ['dubai', 18.2, 18.2, 0],
    ['qatar', 18, 0, 90],
    ['kuwait', 18, 17.5, 0],
    ['egyptian', 19.5, 17.5, 0],
  ] as const)('сохраняет параметры профиля %s из Adhan 4.4.6', (profile, fajrAngle, ishaAngle, ishaInterval) => {
    expect(getEffectiveParameters(withSettings({ profile }), '2026-10-09', 'Asia/Riyadh'))
      .toMatchObject({ fajrAngle, ishaAngle, ishaInterval })
  })

  it.each([
    ['dubai', CalculationMethod.Dubai], ['qatar', CalculationMethod.Qatar],
    ['kuwait', CalculationMethod.Kuwait], ['egyptian', CalculationMethod.Egyptian],
  ] as const)('сохраняет все встроенные поправки preset-а %s', (profile, preset) => {
    const coordinates = new Coordinates(25.2854, 51.531)
    const parameters = preset()
    parameters.highLatitudeRule = HighLatitudeRule.TwilightAngle
    parameters.polarCircleResolution = PolarCircleResolution.AqrabBalad
    const expected = new PrayerTimes(coordinates, new Date(2026, 9, 9, 12), parameters)
    const actual = calculatePrayerSchedule(
      { latitude: coordinates.latitude, longitude: coordinates.longitude },
      '2026-10-09', 'Asia/Qatar',
      { profile, asrMethod: 'standard', highLatitudeRule: 'twilightAngle' },
    )

    expect(actual.entries.fajr.instant).toBe(expected.fajr.getTime())
    expect(actual.entries.sunrise.instant).toBe(expected.sunrise.getTime())
    expect(actual.entries.dhuhr.instant).toBe(expected.dhuhr.getTime())
    expect(actual.entries.asr.instant).toBe(expected.asr.getTime())
    expect(actual.entries.maghrib.instant).toBe(expected.maghrib.getTime())
    expect(actual.entries.isha.instant).toBe(expected.isha.getTime())
  })

  it('использует для Qatar фиксированный интервал Иша 90 минут круглый год', () => {
    for (const date of ['2026-02-18', '2026-06-21']) {
      const schedule = calculatePrayerSchedule(
        { latitude: 25.2854, longitude: 51.531 }, date, 'Asia/Qatar',
        withSettings({ profile: 'qatar' }),
      )
      expect(schedule.entries.isha.instant - schedule.entries.maghrib.instant).toBe(90 * MINUTE)
    }
  })

  it('не переносит расчётное расписание на соседнюю гражданскую дату у линии перемены даты', () => {
    const place = { latitude: 1.87, longitude: -157.4 }
    const date = '2026-01-01'
    const timeZone = 'Pacific/Kiritimati'
    const schedule = calculatePrayerSchedule(place, date, timeZone)
    const civilDates = Object.values(schedule.entries).map(entry =>
      new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(entry.instant)),
    )

    expect(civilDates).toEqual(Array(7).fill(date))
    expect(schedule.entries.zenith.instant).toBe(Date.parse('2025-12-31T22:33:00.000Z'))
  })

  it('сравнивает профиль Turkey с опубликованной таблицей Diyanet для Стамбула', () => {
    const schedule = calculatePrayerSchedule(
      { latitude: 41.0082, longitude: 28.9784 }, '2026-09-11', 'Europe/Istanbul',
      { profile: 'turkey', asrMethod: 'standard', highLatitudeRule: 'twilightAngle' },
    )
    const published = { fajr: '05:06', sunrise: '06:33', dhuhr: '13:06', asr: '16:39', maghrib: '19:29', isha: '20:50' }
    const deviations = Object.fromEntries(Object.entries(published).map(([key, time]) => {
      const actual = schedule.entries[key as keyof typeof published].time.split(':').map(Number)
      const reference = time.split(':').map(Number)
      const actualHour = actual[0] ?? Number.NaN
      const actualMinute = actual[1] ?? Number.NaN
      const publishedHour = reference[0] ?? Number.NaN
      const publishedMinute = reference[1] ?? Number.NaN
      return [key, actualHour * 60 + actualMinute - publishedHour * 60 - publishedMinute]
    }))
    // Primary Diyanet monthly timetable: https://namazvakitleri.diyanet.gov.tr/tr-tr/9541/istanbul-icin-namaz-vakti
    expect(deviations).toEqual({ fajr: 0, sunrise: 0, dhuhr: 0, asr: -1, maghrib: -2, isha: -1 })
  })

  it('rejects non-canonical calculation dates', () => {
    expect(() => calculatePrayerSchedule(KAZAN, '2026-1-15', 'Europe/Moscow')).toThrow('invalid-calculation-date')
    expect(() => calculatePrayerSchedule(KAZAN, '2026-01-15-extra', 'Europe/Moscow')).toThrow('invalid-calculation-date')
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

    expect(CALCULATION_PROFILES.map(profile => profile.id)).toContain('dumRf')
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

  it('проверяет границы Рамадана и интервал Иша по локальному календарю Умм аль-Кура', () => {
    const settings = withSettings({ profile: 'ummAlQura' })
    for (const timeZone of ['Asia/Riyadh', 'Asia/Qatar']) {
      const hijriMonth = (date: string) => Number.parseInt(new Intl.DateTimeFormat(
        'en-u-ca-islamic-umalqura-nu-latn', { month: 'numeric', timeZone },
      ).format(zonedDateTimeToInstant(date, '12:00', timeZone)), 10)
      const dates = Array.from({ length: 80 }, (_, index) => addDays('2026-02-01', index))
      const firstRamadanIndex = dates.findIndex((date, index) =>
        hijriMonth(date) === 9 && (index === 0 || hijriMonth(dates[index - 1] ?? date) !== 9),
      )
      let lastRamadanIndex = -1
      for (let index = 0; index < dates.length; index += 1) {
        const date = dates[index]
        if (date && hijriMonth(date) === 9) lastRamadanIndex = index
      }
      expect(firstRamadanIndex).toBeGreaterThan(0)
      expect(lastRamadanIndex).toBeGreaterThanOrEqual(firstRamadanIndex)
      const boundaryDates = [
        dates[firstRamadanIndex - 1], dates[firstRamadanIndex],
        dates[lastRamadanIndex], dates[lastRamadanIndex + 1],
      ].filter((date): date is string => date !== undefined)

      for (const date of boundaryDates) {
        const schedule = calculatePrayerSchedule(MECCA, date, timeZone, settings)
        const interval = hijriMonth(date) === 9 ? 120 : 90
        expect(schedule.entries.isha.instant - schedule.entries.maghrib.instant).toBe(interval * MINUTE)
      }
    }
  })

  it('явно отклоняет Умм аль-Кура, если точный календарь недоступен', () => {
    const reason = 'ummAlQuraUnavailable' as const
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

describe('расчёт солнечного транзита', () => {
  it.each([
    ['Pacific/Apia на границе года', { latitude: -13.83, longitude: -171.76 }, 'Pacific/Apia', '2026-01-01', '2025-12-31T23:30:22.000Z', '12:30'],
    ['Pacific/Kiritimati на границе года', { latitude: 1.87, longitude: -157.4 }, 'Pacific/Kiritimati', '2026-01-01', '2025-12-31T22:32:54.000Z', '12:32'],
    ['Pacific/Kiritimati перед UTC-сменой года', { latitude: 1.87, longitude: -157.4 }, 'Pacific/Kiritimati', '2026-12-31', '2026-12-30T22:32:19.000Z', '12:32'],
    ['New York при начале DST', { latitude: 40.71, longitude: -74.01 }, 'America/New_York', '2026-03-08', '2026-03-08T17:06:44.000Z', '13:06'],
    ['New York при окончании DST', { latitude: 40.71, longitude: -74.01 }, 'America/New_York', '2026-11-01', '2026-11-01T16:39:34.000Z', '11:39'],
    ['обычный пояс Europe/Moscow', { latitude: 55.79, longitude: 49.12 }, 'Europe/Moscow', '2026-06-21', '2026-06-21T08:45:19.000Z', '11:45'],
  ] as const)('совпадает с независимым солнечным транзитом NOAA: %s', (_label, coordinates, timeZone, date, reference, localTime) => {
    const zenith = calculateSolarZenith(coordinates, date, timeZone)
    expect(zenith).not.toBeNull()
    if (!zenith) throw new Error('Не удалось рассчитать зенит')
    // Эталонные UTC-моменты рассчитаны по уравнениям NOAA: https://gml.noaa.gov/grad/solcalc/solareqns.PDF
    expect(Math.abs(zenith.instant - Date.parse(reference))).toBeLessThanOrEqual(5_000)
    expect(zenith.time).toBe(localTime)
    expect(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(zenith.instant)))
      .toBe(date)
  })

  it.each([
    [{ latitude: -13.83, longitude: -171.76 }, 'Pacific/Apia', '2026-01-15'],
    [{ latitude: 1.87, longitude: -157.4 }, 'Pacific/Kiritimati', '2026-01-15'],
    [{ latitude: 40.71, longitude: -74.01 }, 'America/New_York', '2026-03-08'],
  ] as const)('возвращает зенит внутри местной даты %s %s', (coordinates, timeZone, date) => {
    const zenith = calculateSolarZenith(coordinates, date, timeZone)
    expect(zenith).not.toBeNull()
    if (!zenith) throw new Error('Не удалось рассчитать зенит')
    expect(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(zenith.instant)))
      .toBe(date)
    expect(Math.abs(zenith.instant - zonedDateTimeToInstant(date, zenith.time, timeZone).getTime())).toBeLessThan(60_000)
  })

  it('сохраняет явную недоступность для пропущенной гражданской даты', () => {
    expect(calculateSolarZenith({ latitude: -13.83, longitude: -171.76 }, '2011-12-30', 'Pacific/Apia')).toBeNull()
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
  expect(() => calculatePrayerSchedule(KAZAN, '2026-01-01', 'Europe/Moscow', withSettings({ adjustments: { fajr: Infinity } }))).toThrow('invalid-calculation-settings')
})
