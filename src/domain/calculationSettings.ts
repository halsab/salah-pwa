import { CALCULATION_PROFILES, type AsrMethod, type CalculationProfileId, type CalculationSettings, type HighLatitudeMethod } from './prayerCalculation'
import type { CalculatedPrayerKey } from './types'

export type IshaMethod = { kind: 'angle'; angle: number } | { kind: 'interval'; minutes: number }
export interface CalculationOverrides {
  asrMethod?: AsrMethod
  highLatitudeRule?: HighLatitudeMethod
  fajrAngle?: number
  isha?: IshaMethod
  adjustments?: Partial<Record<CalculatedPrayerKey, number>>
}
export interface CalculationSelection {
  profile: CalculationProfileId
  overrides: CalculationOverrides
}
export const CALCULATED_KEYS: readonly CalculatedPrayerKey[] = ['fajr', 'sunrise', 'zenith', 'dhuhr', 'asr', 'maghrib', 'isha']

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function bounded(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}
export function isCalculationSelection(value: unknown): value is CalculationSelection {
  if (!record(value) || !CALCULATION_PROFILES.some(p => p.id === value.profile) || !record(value.overrides)) return false
  const o = value.overrides
  if (Object.keys(o).some(key => !['asrMethod', 'highLatitudeRule', 'fajrAngle', 'isha', 'adjustments'].includes(key))) return false
  if (o.asrMethod !== undefined && o.asrMethod !== 'hanafi' && o.asrMethod !== 'standard') return false
  if (o.highLatitudeRule !== undefined && (typeof o.highLatitudeRule !== 'string' || !['dumRt', 'seventhOfNight', 'twilightAngle', 'nearestDay'].includes(o.highLatitudeRule))) return false
  if (o.fajrAngle !== undefined && !bounded(o.fajrAngle, 1, 30)) return false
  if (o.isha !== undefined) {
    if (!record(o.isha)) return false
    const isha = o.isha
    if (isha.kind === 'angle') {
      if (!bounded(isha.angle, 1, 30) || Object.keys(isha).some(key => !['kind', 'angle'].includes(key))) return false
    } else if (isha.kind === 'interval') {
      if (!bounded(isha.minutes, 1, 240) || !Number.isInteger(isha.minutes) || Object.keys(isha).some(key => !['kind', 'minutes'].includes(key))) return false
    } else return false
  }
  if (o.adjustments !== undefined && (!record(o.adjustments) || Object.entries(o.adjustments).some(([key, minutes]) =>
    !CALCULATED_KEYS.includes(key as CalculatedPrayerKey) || !bounded(minutes, -180, 180) || !Number.isInteger(minutes)))) return false
  return true
}

export function profileDefaults(profile: CalculationProfileId): CalculationSettings {
  return {
    profile,
    asrMethod: profile === 'dumRt' || profile === 'dumRf' || profile === 'karachi' ? 'hanafi' : 'standard',
    highLatitudeRule: profile === 'dumRt' ? 'dumRt' : 'twilightAngle',
  }
}
export function effectiveCalculationSettings(selection: CalculationSelection): CalculationSettings {
  if (!isCalculationSelection(selection)) throw new RangeError('Некорректные параметры расчёта')
  return { ...profileDefaults(selection.profile), ...selection.overrides }
}
export function selectionFromSettings(settings: CalculationSettings): CalculationSelection {
  const { profile, ...overrides } = settings
  return { profile, overrides }
}
export function isCalculationSettings(value: unknown): value is CalculationSettings {
  if (!record(value) || value.asrMethod === undefined || value.highLatitudeRule === undefined) return false
  const { profile, ...overrides } = value
  return isCalculationSelection({ profile, overrides })
}

export function calculationSettingsKey(settings: CalculationSettings): string {
  return JSON.stringify([
    settings.profile, settings.asrMethod, settings.highLatitudeRule, settings.fajrAngle,
    settings.isha?.kind, settings.isha?.kind === 'angle' ? settings.isha.angle : settings.isha?.minutes,
    CALCULATED_KEYS.map(key => settings.adjustments?.[key] ?? 0),
  ])
}
