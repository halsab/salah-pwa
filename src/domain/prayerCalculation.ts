import {
  CalculationMethod,
  Coordinates,
  HighLatitudeRule,
  Madhab,
  PolarCircleResolution,
  PrayerTimes,
  Rounding,
  type CalculationParameters,
} from 'adhan'

import { addDays } from './date'
import type {
  CalculatedPrayerEntries,
  CalculatedPrayerKey,
  PrayerTime,
} from './types'

export type CalculationProfileId =
  | 'dumRt'
  | 'dumRf'
  | 'turkey'
  | 'muslimWorldLeague'
  | 'karachi'
  | 'northAmerica'
  | 'ummAlQura'

export type AsrMethod = 'hanafi' | 'standard'

export type HighLatitudeMethod =
  | 'dumRt'
  | 'seventhOfNight'
  | 'twilightAngle'
  | 'nearestDay'

export interface CalculationSettings {
  profile: CalculationProfileId
  asrMethod: AsrMethod
  highLatitudeRule: HighLatitudeMethod
}

export interface CalculationProfileOption {
  id: CalculationProfileId
  label: string
}

export const CALCULATION_PROFILES: readonly CalculationProfileOption[] = [
  { id: 'dumRt', label: 'ДУМ РТ' },
  { id: 'dumRf', label: 'ДУМ РФ' },
  { id: 'turkey', label: 'Турция · Diyanet' },
  { id: 'muslimWorldLeague', label: 'Muslim World League' },
  { id: 'karachi', label: 'Карачи' },
  { id: 'northAmerica', label: 'ISNA' },
  { id: 'ummAlQura', label: 'Умм аль-Кура' },
]

export const DEFAULT_CALCULATION_SETTINGS: CalculationSettings = {
  profile: 'dumRt',
  asrMethod: 'hanafi',
  highLatitudeRule: 'dumRt',
}

export interface CalculatedPrayerSchedule {
  date: string
  profile: CalculationProfileId
  entries: CalculatedPrayerEntries
  estimatedPrayers: CalculatedPrayerKey[]
  polarResolutionApplied: boolean
}

interface LocationCoordinates {
  latitude: number
  longitude: number
}

const MINUTE = 60_000
const DIRECT_ANGLE_MARGIN = 1_000

function dateFromIso(date: string): Date {
  const [year = 0, month = 0, day = 0] = date.split('-').map(Number)
  const result = new Date(year, month - 1, day, 12)
  if (
    !year ||
    !month ||
    !day ||
    result.getFullYear() !== year ||
    result.getMonth() !== month - 1 ||
    result.getDate() !== day
  ) {
    throw new Error('Некорректная дата для расчёта')
  }
  return result
}

function isRamadan(date: Date): boolean {
  try {
    const month = new Intl.DateTimeFormat(
      'en-u-ca-islamic-umalqura-nu-latn',
      { month: 'numeric' },
    ).format(date)
    return Number.parseInt(month, 10) === 9
  } catch {
    return false
  }
}

function profileParameters(
  profile: CalculationProfileId,
  date: Date,
): CalculationParameters {
  if (profile === 'dumRt' || profile === 'dumRf') {
    const parameters = CalculationMethod.Other()
    parameters.fajrAngle = profile === 'dumRt' ? 18 : 16
    parameters.ishaAngle = 15
    if (profile === 'dumRt') parameters.rounding = Rounding.None
    return parameters
  }

  const parameters = {
    turkey: CalculationMethod.Turkey,
    muslimWorldLeague: CalculationMethod.MuslimWorldLeague,
    karachi: CalculationMethod.Karachi,
    northAmerica: CalculationMethod.NorthAmerica,
    ummAlQura: CalculationMethod.UmmAlQura,
  }[profile]()

  if (profile === 'ummAlQura' && isRamadan(date)) {
    parameters.ishaInterval = 120
  }
  return parameters
}

function applyUserRules(
  parameters: CalculationParameters,
  settings: CalculationSettings,
): void {
  parameters.madhab = settings.asrMethod === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi
  parameters.polarCircleResolution =
    settings.highLatitudeRule === 'nearestDay'
      ? PolarCircleResolution.AqrabYaum
      : PolarCircleResolution.AqrabBalad

  parameters.highLatitudeRule =
    settings.highLatitudeRule === 'seventhOfNight'
      ? HighLatitudeRule.SeventhOfTheNight
      : settings.highLatitudeRule === 'twilightAngle' ||
          settings.highLatitudeRule === 'nearestDay'
        ? HighLatitudeRule.TwilightAngle
        : HighLatitudeRule.MiddleOfTheNight
}

function hasPolarGap(
  coordinates: Coordinates,
  date: Date,
): boolean {
  const parameters = CalculationMethod.Other()
  parameters.polarCircleResolution = PolarCircleResolution.Unresolved
  parameters.rounding = Rounding.None
  const today = new PrayerTimes(coordinates, date, parameters)
  const tomorrow = new PrayerTimes(
    coordinates,
    dateFromIso(addDays(toIsoDate(date), 1)),
    parameters,
  )

  return [today.sunrise, today.sunset, tomorrow.sunrise].some(
    (instant) => !Number.isFinite(instant.getTime()),
  )
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function angleIsAvailable(
  coordinates: Coordinates,
  date: string,
  angle: number,
  polarResolution: CalculationParameters['polarCircleResolution'],
  prayer: 'fajr' | 'isha',
): boolean {
  if (angle <= 0) return true

  const parameters = CalculationMethod.Other()
  parameters.fajrAngle = angle
  parameters.ishaAngle = angle
  parameters.highLatitudeRule = HighLatitudeRule.MiddleOfTheNight
  parameters.polarCircleResolution = polarResolution
  parameters.rounding = Rounding.None
  parameters.nightPortions = () => ({ fajr: 1, isha: 1 })

  const today = new PrayerTimes(coordinates, dateFromIso(date), parameters)
  const yesterday = new PrayerTimes(
    coordinates,
    dateFromIso(addDays(date, -1)),
    parameters,
  )
  const tomorrow = new PrayerTimes(
    coordinates,
    dateFromIso(addDays(date, 1)),
    parameters,
  )
  if (prayer === 'fajr') {
    const midnight =
      yesterday.sunset.getTime() +
      (today.sunrise.getTime() - yesterday.sunset.getTime()) / 2
    return (
      Number.isFinite(midnight) &&
      today.fajr.getTime() > midnight + DIRECT_ANGLE_MARGIN &&
      today.fajr.getTime() < today.sunrise.getTime()
    )
  }

  const midnight =
    today.sunset.getTime() +
    (tomorrow.sunrise.getTime() - today.sunset.getTime()) / 2
  return (
    Number.isFinite(midnight) &&
    today.isha.getTime() > today.sunset.getTime() &&
    today.isha.getTime() < midnight - DIRECT_ANGLE_MARGIN
  )
}

function roundMinute(instant: Date, rounding: 'nearest' | 'up'): Date {
  const value = instant.getTime() / MINUTE
  return new Date(
    (rounding === 'up' ? Math.ceil(value) : Math.round(value)) * MINUTE,
  )
}

function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * MINUTE)
}

export function formatSystemTime(instant: Date): PrayerTime {
  const hours = String(instant.getHours()).padStart(2, '0')
  const minutes = String(instant.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}` as PrayerTime
}

function entry(instant: Date, estimated: boolean): CalculatedPrayerEntries['fajr'] {
  return {
    instant: instant.getTime(),
    time: formatSystemTime(instant),
    estimated,
  }
}

export function calculatePrayerSchedule(
  location: LocationCoordinates,
  date: string,
  settings: CalculationSettings = DEFAULT_CALCULATION_SETTINGS,
): CalculatedPrayerSchedule {
  const calendarDate = dateFromIso(date)
  const coordinates = new Coordinates(location.latitude, location.longitude)
  const parameters = profileParameters(settings.profile, calendarDate)
  applyUserRules(parameters, settings)

  const polarResolutionApplied = hasPolarGap(coordinates, calendarDate)
  if (settings.highLatitudeRule === 'dumRt') {
    // Не ограничиваем существующий сумрак долей ночи: подстановка 120/90 выполняется ниже.
    parameters.nightPortions = () => ({ fajr: 1, isha: 1 })
  }
  const times = new PrayerTimes(coordinates, calendarDate, parameters)
  const dumRtNorthRule = settings.highLatitudeRule === 'dumRt'
  const previousNightHasFajr = !polarResolutionApplied && angleIsAvailable(
    coordinates,
    date,
    dumRtNorthRule ? 18 : parameters.fajrAngle,
    parameters.polarCircleResolution,
    'fajr',
  )
  const currentNightHasIsha =
    (!dumRtNorthRule && parameters.ishaInterval > 0) ||
    (!polarResolutionApplied && angleIsAvailable(
      coordinates,
      date,
      dumRtNorthRule ? 18 : parameters.ishaAngle,
      parameters.polarCircleResolution,
      'isha',
    ))

  let fajr = times.fajr
  let isha = times.isha
  let fajrEstimated = !previousNightHasFajr
  let ishaEstimated = !currentNightHasIsha

  if (settings.highLatitudeRule === 'dumRt') {
    if (!previousNightHasFajr) fajr = addMinutes(times.sunrise, -120)
    if (!currentNightHasIsha) isha = addMinutes(times.sunset, 90)
  }

  if (polarResolutionApplied) {
    fajrEstimated = true
    ishaEstimated = true
  }

  const transitParameters = CalculationMethod.Other()
  transitParameters.polarCircleResolution = parameters.polarCircleResolution
  transitParameters.rounding =
    settings.profile === 'dumRt' ? Rounding.None : parameters.rounding
  const transit = new PrayerTimes(
    coordinates,
    calendarDate,
    transitParameters,
  ).dhuhr

  if (settings.profile === 'dumRt') {
    fajr = roundMinute(fajr, 'nearest')
    isha = roundMinute(isha, 'up')
  }

  const sunrise =
    settings.profile === 'dumRt' ? roundMinute(times.sunrise, 'up') : times.sunrise
  const zenith =
    settings.profile === 'dumRt' ? roundMinute(transit, 'up') : transit
  const dhuhr =
    settings.profile === 'dumRt'
      ? roundMinute(addMinutes(transit, 1), 'up')
      : times.dhuhr
  const asr = settings.profile === 'dumRt' ? roundMinute(times.asr, 'up') : times.asr
  const maghrib =
    settings.profile === 'dumRt' ? roundMinute(times.sunset, 'up') : times.maghrib

  const entries: CalculatedPrayerEntries = {
    fajr: entry(fajr, fajrEstimated),
    sunrise: entry(sunrise, polarResolutionApplied),
    zenith: entry(zenith, polarResolutionApplied),
    dhuhr: entry(dhuhr, polarResolutionApplied),
    asr: entry(asr, polarResolutionApplied),
    maghrib: entry(maghrib, polarResolutionApplied),
    isha: entry(isha, ishaEstimated),
  }
  const estimatedPrayers = (Object.keys(entries) as CalculatedPrayerKey[]).filter(
    (key) => entries[key].estimated,
  )

  return {
    date,
    profile: settings.profile,
    entries,
    estimatedPrayers,
    polarResolutionApplied,
  }
}
