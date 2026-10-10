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
    expect(schedule.estimatedPrayers).toEqual([
      'fajr', 'sunrise', 'zenith', 'dhuhr', 'asr', 'maghrib', 'isha',
    ])
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
    expect(schedule.estimatedPrayers).toEqual([
      'fajr', 'sunrise', 'zenith', 'dhuhr', 'asr', 'maghrib', 'isha',
    ])
    expect(Number.isFinite(schedule.entries.sunrise.instant)).toBe(true)
    expect(Number.isFinite(schedule.entries.maghrib.instant)).toBe(true)
  })

  it('retains the selected profile rounding for the schedule zenith', () => {
    const coordinates = new Coordinates(41.0082, 28.9784)
    const parameters = CalculationMethod.Turkey()
    parameters.highLatitudeRule = HighLatitudeRule.TwilightAngle
    parameters.polarCircleResolution = PolarCircleResolution.AqrabBalad
    const transitParameters = CalculationMethod.Other()
    transitParameters.polarCircleResolution = parameters.polarCircleResolution
    transitParameters.rounding = parameters.rounding
    const expected = new PrayerTimes(coordinates, new Date(2026, 8, 11, 12), transitParameters)
    const schedule = calculatePrayerSchedule(
      { latitude: coordinates.latitude, longitude: coordinates.longitude },
      '2026-09-11', 'Europe/Istanbul',
      { profile: 'turkey', asrMethod: 'standard', highLatitudeRule: 'twilightAngle' },
    )

    expect(schedule.entries.zenith.instant).toBe(expected.dhuhr.getTime())
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

  it.each([
    ['Pacific/Apia', { latitude: -13.83, longitude: -171.76 }, '2026-01-01'],
    ['Pacific/Kiritimati', { latitude: 1.87, longitude: -157.4 }, '2026-01-01'],
    ['America/New_York at DST start', { latitude: 40.71, longitude: -74.01 }, '2026-03-08'],
    ['America/New_York at DST end', { latitude: 40.71, longitude: -74.01 }, '2026-11-01'],
    ['Toronto', { latitude: 43.6532, longitude: -79.3832 }, '2026-01-01'],
    ['Yellowknife', { latitude: 62.454, longitude: -114.3718 }, '2026-06-21'],
    ['Murmansk', { latitude: 68.9585, longitude: 33.0827 }, '2026-06-21'],
    ['Sinop', { latitude: 42.0268, longitude: 35.1511 }, '2026-06-21'],
    ['Tromso', { latitude: 69.6492, longitude: 18.9553 }, '2026-06-21'],
  ] as const)('keeps all schedule events on the requested local date for %s', (label, coordinates, date) => {
    const timeZone = label.startsWith('Pacific/')
      ? label
      : label.startsWith('America/') ? 'America/New_York'
        : label === 'Toronto' ? 'America/Toronto'
            : label === 'Yellowknife' ? 'America/Yellowknife'
          : label === 'Murmansk' ? 'Europe/Moscow'
              : label === 'Sinop' ? 'Europe/Istanbul' : 'Europe/Oslo'
    const schedule = calculatePrayerSchedule(coordinates, date, timeZone)
    const localDates = Object.entries(schedule.entries).map(([key, entry]) => {
      const localDate = new Intl.DateTimeFormat('en-CA', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date(entry.instant))
      if (localDate !== date) expect(schedule.estimatedPrayers).toContain(key)
      return localDate
    })
    for (const [index, key] of Object.keys(schedule.entries).entries()) {
      if (schedule.estimatedPrayers.includes(key as keyof typeof schedule.entries)) continue
      expect(localDates[index]).toBe(date)
    }

    const zenith = calculateSolarZenith(coordinates, date, timeZone)
    expect(zenith).not.toBeNull()
    expect(Math.abs(schedule.entries.zenith.instant - (zenith?.instant ?? 0))).toBeLessThan(MINUTE)
  })

  it('calculates consecutive dates and both calendar-year edges without shifting local dates', () => {
    for (const [timeZone, coordinates, firstDate] of [
      ['Pacific/Kiritimati', { latitude: 1.87, longitude: -157.4 }, '2026-12-30'],
      ['Pacific/Apia', { latitude: -13.83, longitude: -171.76 }, '2026-12-31'],
      ['Europe/Moscow', KAZAN, '2026-12-31'],
    ] as const) {
      for (let offset = 0; offset < 3; offset += 1) {
        const date = addDays(firstDate, offset)
        const schedule = calculatePrayerSchedule(coordinates, date, timeZone)
        expect(schedule.date).toBe(date)
        expect(Object.values(schedule.entries).every(entry => Number.isFinite(entry.instant))).toBe(true)
        expect(Object.values(schedule.entries).map(entry =>
          new Intl.DateTimeFormat('en-CA', {
            timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
          }).format(new Date(entry.instant)),
        )).toEqual(Array(7).fill(date))
      }
    }
  })
})

describe('independent institutional comparisons', () => {
  const keys = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const
  const minutes = (time: string) => {
    const [hour = 0, minute = 0] = time.split(':').map(Number)
    return hour * 60 + minute
  }

  it.each([
    ['2026-01-15', ['06:24', '07:48', '12:28', '14:48', '17:07', '18:15'], [11, 0, -1, 0, -1, 5]],
    ['2026-04-15', ['05:11', '06:36', '13:19', '17:03', '20:01', '21:07'], [12, -1, -1, 1, 0, 7]],
    ['2026-07-15', ['04:06', '05:49', '13:24', '17:28', '20:58', '22:17'], [17, 1, 0, -1, -1, 7]],
    ['2026-10-15', ['06:14', '07:31', '13:04', '16:06', '18:36', '19:38'], [10, 1, -1, -3, -2, 4]],
  ] as const)('compares Toronto FCNA calculation with the Quran & Sunnah Society 2026 timetable for %s', (date, published, expectedDeviations) => {
    const schedule = calculatePrayerSchedule(
      { latitude: 43.6532, longitude: -79.3832 }, date, 'America/Toronto',
      { profile: 'canadaFcna', asrMethod: 'standard', highLatitudeRule: 'twilightAngle' },
    )
    const deviations = keys.map((key, index) =>
      minutes(schedule.entries[key].time) - minutes(published[index] ?? ''),
    )
    // Quran & Sunnah Society of Canada, Toronto Prayer Times (2026):
    // https://qssc.org/Download/TorontoPrayerTimes2026.pdf
    // The columns identify Fajr, sunrise (Shuruq), Dhuhr, Asr, Maghrib and Isha.
    expect(deviations).toEqual(expectedDeviations)
  })

  // IACAD Ramadan calendar: https://iacad.gov.ae/assets/b4d53ecb/ramadan-in-dubai-2026-ad-1447-ah.aspx
  // Egypt's General Authority for Survey: https://www.esa.gov.eg/praytimes.aspx
  it.each([
    ['dubai', { latitude: 25.2048, longitude: 55.2708 }, '2026-02-18', 'Asia/Dubai',
      ['05:34', '06:48', '12:36', '15:50', '18:18', '19:32'], [0, 0, 0, 2, 0, 0]],
    ['egyptian', { latitude: 30.0444, longitude: 31.2357 }, '2026-10-10', 'Africa/Cairo',
      ['05:27', '06:53', '12:42', '16:01', '18:30', '19:47'], [0, 1, 1, -1, 0, 0]],
  ] as const)('compares %s with its dated institutional timetable', (profile, coordinates, date, timeZone, published, expectedDeviations) => {
    const schedule = calculatePrayerSchedule(coordinates, date, timeZone, {
      profile, asrMethod: 'standard', highLatitudeRule: 'twilightAngle',
    })
    const deviations = keys.map((key, index) =>
      minutes(schedule.entries[key].time) - minutes(published[index] ?? ''),
    )
    expect(deviations).toEqual(expectedDeviations)
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
