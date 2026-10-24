import { automaticCalculationRecommendation, effectiveCalculationSettings, profileDefaults, selectionFromSettings, type CalculationSelection } from './calculationSettings'
import type { Place } from './place'
import type { CalculationProfileId, CalculationSettings } from './prayerCalculation'
import type { SourcePreferences } from './sourcePreferences'

export type ResolvedPrayerSource = {
  kind: 'calculated'
  status: 'ready' | 'unsupported'
  settings: CalculationSettings
  timeZone: string
  strategy: 'manual' | 'regional' | 'default'
}

const PORTABLE_PROFILES: readonly CalculationProfileId[] = ['tatarstan', 'russia', 'turkey', 'muslimWorldLeague', 'karachi', 'northAmerica', 'ummAlQura', 'canadaFcna', 'dubai', 'qatar', 'kuwait', 'egyptian']

export function resolvePrayerTimeSource(
  location: Place,
  preferences: SourcePreferences,
  supportedProfiles: readonly CalculationProfileId[] = PORTABLE_PROFILES,
): ResolvedPrayerSource {
  if (preferences.mode === 'manual') {
    const settings = effectiveCalculationSettings(preferences.source.calculation)
    return { kind: 'calculated', status: supportedProfiles.includes(settings.profile) ? 'ready' : 'unsupported', settings, timeZone: location.timeZone, strategy: 'manual' }
  }
  const recommendation = automaticCalculationRecommendation(location)
  const regional = recommendation.profile
  const canUseRegional = supportedProfiles.includes(regional)
  const profile = canUseRegional ? regional : 'muslimWorldLeague'
  const settings = profile === regional
    ? { ...profileDefaults(profile), asrMethod: recommendation.asrMethod }
    : profileDefaults(profile)
  if (profile !== 'tatarstan' && Math.abs(location.latitude) > 48) settings.highLatitudeRule = 'seventhOfNight'
  return { kind: 'calculated', status: supportedProfiles.includes(profile) ? 'ready' : 'unsupported', settings,
    timeZone: location.timeZone, strategy: canUseRegional ? recommendation.strategy : 'default' }
}

export function initialManualCalculation(
  location: Place,
  supportedProfiles?: readonly CalculationProfileId[],
): CalculationSelection | undefined {
  const effective = resolvePrayerTimeSource(location, { mode: 'automatic' }, supportedProfiles)
  return effective.status === 'ready'
    ? selectionFromSettings(effective.settings)
    : undefined
}
