import { getCivilDate } from './locationTime'
import { effectiveCalculationSettings, profileDefaults } from './calculationSettings'
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
  locations: PrayerLocation[]
  state: 'ready' | 'not-loaded' | 'invalid'
  version: string
  revision: string
}
export type ResolvedPrayerSource =
  | { kind: 'official'; status: 'ready' | 'not-loaded' | 'invalid' | 'not-covered'; provider: string; version: string | null; revision: string | null; coverage: string | null; locationId: string | null; timeZone: string }
  | { kind: 'calculated'; status: 'ready' | 'unsupported'; settings: CalculationSettings; timeZone: string; strategy: 'manual' | 'regional' | 'default' }

const PORTABLE_PROFILES: readonly CalculationProfileId[] = ['dumRt', 'dumRf', 'turkey', 'muslimWorldLeague', 'karachi', 'northAmerica']
function regionProfile(location: Place): CalculationProfileId | undefined {
  if (location.region?.code === 'RU-TA' && location.coverage === 'inside') return 'dumRt'
  const country = location.region?.code.split('.')[0]
  if (country === 'RU') return 'dumRf'
  if (country === 'TR') return 'turkey'
  if (country === 'PK' || country === 'BD') return 'karachi'
  if (country === 'US' || country === 'CA') return 'northAmerica'
  if (country === 'SA') return 'ummAlQura'
  return undefined
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
    if (!locality || !dataset.years.includes(Number((typeof date === 'string' ? date : getCivilDate(date, dataset.timeZone)).slice(0, 4)))) continue
    return { kind: 'official', status: dataset.state, provider: dataset.provider, version: dataset.version, revision: dataset.revision, coverage: dataset.coverage, locationId: locality.id, timeZone: dataset.timeZone }
  }
  if (manual?.kind === 'official') {
    return { kind: 'official', status: 'not-covered', provider: manual.provider, version: null, revision: null, coverage: null, locationId: null, timeZone: datasets.find(d => d.provider === manual.provider)?.timeZone ?? location.timeZone }
  }
  const regional = regionProfile(location)
  const profile = regional && supportedProfiles.includes(regional) ? regional : 'muslimWorldLeague'
  const settings = profileDefaults(profile)
  if (profile !== 'dumRt' && Math.abs(location.latitude) > 48) settings.highLatitudeRule = 'seventhOfNight'
  return { kind: 'calculated', status: supportedProfiles.includes(profile) ? 'ready' : 'unsupported', settings, timeZone: location.timeZone, strategy: regional === profile ? 'regional' : 'default' }
}
