import { DUM_RT_TIME_ZONE, getCivilDate } from './locationTime'
import { automaticCalculationRecommendation, effectiveCalculationSettings, profileDefaults, selectionFromSettings, type CalculationSelection } from './calculationSettings'
import { officialLocationForPlace, type Place } from './place'
import type { CalculationProfileId, CalculationSettings } from './prayerCalculation'
import type { SourcePreferences } from './sourcePreferences'
import type { PrayerLocation } from './types'

export interface OfficialDatasetAvailability {
  provider: string
  priority: number
  timeZone: string
  coverage: string
  years: readonly number[]
  schemaVersion?: number
  startDate?: string
  endDate?: string
  locations: PrayerLocation[]
  state: 'ready' | 'not-loaded' | 'invalid'
  version: string
  revision: string
}
export type ResolvedPrayerSource =
  | { kind: 'official'; status: 'ready' | 'not-loaded' | 'invalid' | 'not-covered'; provider: string; version: string | null; revision: string | null; coverage: string | null; locationId: string | null; timeZone: string }
  | { kind: 'calculated'; status: 'ready' | 'unsupported'; settings: CalculationSettings; timeZone: string; strategy: 'manual' | 'regional' | 'default' }

const PORTABLE_PROFILES: readonly CalculationProfileId[] = ['dumRt', 'dumRf', 'turkey', 'muslimWorldLeague', 'karachi', 'northAmerica', 'canadaFcna', 'dubai', 'qatar', 'kuwait', 'egyptian']

function isCivilDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function coversDate(dataset: OfficialDatasetAvailability, civilDate: string): boolean {
  if (!isCivilDate(civilDate)) return false
  const year = Number(civilDate.slice(0, 4))
  if (dataset.schemaVersion === 3) {
    return Boolean(dataset.startDate && dataset.endDate
      && civilDate >= dataset.startDate && civilDate <= dataset.endDate)
  }
  return dataset.years.includes(year)
}
export function resolvePrayerTimeSource(
  location: Place,
  date: string | Date,
  preferences: SourcePreferences,
  availableOfficialDatasets: readonly OfficialDatasetAvailability[],
  supportedProfiles: readonly CalculationProfileId[] = PORTABLE_PROFILES,
): ResolvedPrayerSource {
  const manual = preferences.mode === 'manual' ? preferences.source : null
  if (manual?.kind === 'calculated') {
    const settings = effectiveCalculationSettings(manual.calculation)
    return { kind: 'calculated', status: supportedProfiles.includes(settings.profile) ? 'ready' : 'unsupported', settings, timeZone: location.timeZone, strategy: 'manual' }
  }
  const datasets = [...availableOfficialDatasets].sort((a, b) => a.priority - b.priority || (a.provider < b.provider ? -1 : a.provider > b.provider ? 1 : 0)
    || Number(b.state === 'ready') - Number(a.state === 'ready')
    || (a.revision < b.revision ? -1 : a.revision > b.revision ? 1 : 0))
  for (const dataset of datasets) {
    if (manual?.kind === 'official' && manual.provider !== dataset.provider) continue
    const locality = location.region?.code === dataset.coverage ? officialLocationForPlace(location, dataset.locations) : null
    const civilDate = typeof date === 'string'
      ? date
      : getCivilDate(date, dataset.provider === 'dumRt' ? DUM_RT_TIME_ZONE : dataset.timeZone)
    if (!locality || !coversDate(dataset, civilDate)) continue
    return { kind: 'official', status: dataset.state, provider: dataset.provider, version: dataset.version, revision: dataset.revision, coverage: dataset.coverage, locationId: locality.id, timeZone: dataset.provider === 'dumRt' ? DUM_RT_TIME_ZONE : locality.timeZone ?? dataset.timeZone }
  }
  if (manual?.kind === 'official') {
    const providerTimeZone = datasets.find(d => d.provider === manual.provider)?.timeZone
    return { kind: 'official', status: 'not-covered', provider: manual.provider, version: null, revision: null, coverage: null, locationId: null,
      timeZone: manual.provider === 'dumRt' ? DUM_RT_TIME_ZONE : providerTimeZone ?? location.timeZone }
  }
  const recommendation = automaticCalculationRecommendation(location)
  const regional = recommendation.profile
  const canUseRegional = supportedProfiles.includes(regional)
  const profile = canUseRegional ? regional : 'muslimWorldLeague'
  const settings = profile === regional
    ? { ...profileDefaults(profile), asrMethod: recommendation.asrMethod }
    : profileDefaults(profile)
  if (profile !== 'dumRt' && Math.abs(location.latitude) > 48) settings.highLatitudeRule = 'seventhOfNight'
  return { kind: 'calculated', status: supportedProfiles.includes(profile) ? 'ready' : 'unsupported', settings, timeZone: location.timeZone, strategy: canUseRegional ? recommendation.strategy : 'default' }
}

export function initialManualCalculation(
  location: Place,
  date: string | Date,
  availableOfficialDatasets: readonly OfficialDatasetAvailability[],
  supportedProfiles?: readonly CalculationProfileId[],
): CalculationSelection | undefined {
  const automatic = resolvePrayerTimeSource(location, date, { mode: 'automatic' }, availableOfficialDatasets, supportedProfiles)
  const effective = automatic.kind === 'official'
    ? resolvePrayerTimeSource(location, date, { mode: 'automatic' }, [], supportedProfiles)
    : automatic
  return effective.kind === 'calculated' && effective.status === 'ready'
    ? selectionFromSettings(effective.settings)
    : undefined
}
