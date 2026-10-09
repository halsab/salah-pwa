import { UMM_AL_QURA_UNAVAILABLE_REASON, type AsrMethod, type CalculationProfileCapability, type CalculationProfileId, type HighLatitudeMethod } from '../domain/prayerCalculation'
import type { CalculatedPrayerKey } from '../domain/types'
import type { MessageKey, Translator } from '../localization/messages'

export const ASR_METHOD_KEYS: Record<AsrMethod, MessageKey> = {
  hanafi: 'hanafi',
  standard: 'asrStandard',
}

export const EVENT_LABEL_KEYS: Record<CalculatedPrayerKey, MessageKey> = {
  fajr: 'prayerFajr', sunrise: 'prayerSunrise', zenith: 'prayerZenith', dhuhr: 'prayerDhuhr',
  asr: 'prayerAsr', maghrib: 'prayerMaghrib', isha: 'prayerIsha',
}

export const HIGH_LATITUDE_KEYS: Record<HighLatitudeMethod, MessageKey> = {
  dumRt: 'highLatitudeDumRt', seventhOfNight: 'highLatitudeSeventhOfNight',
  twilightAngle: 'highLatitudeTwilightAngle', nearestDay: 'highLatitudeNearestDay',
}

export const PROFILE_LABEL_KEYS: Record<CalculationProfileId, MessageKey> = {
  dumRt: 'profileDumRt', dumRf: 'profileDumRf', turkey: 'profileTurkey',
  muslimWorldLeague: 'profileMuslimWorldLeague', karachi: 'profileKarachi',
  northAmerica: 'profileNorthAmerica', ummAlQura: 'profileUmmAlQura',
}

export function calculationCapabilityMessage(profile: CalculationProfileId, capability: CalculationProfileCapability, t: Translator): string | null {
  if (capability.supported) return null
  return profile === 'ummAlQura' && capability.reason === UMM_AL_QURA_UNAVAILABLE_REASON
    ? t('unsupportedProfile', { profile: t(PROFILE_LABEL_KEYS[profile]) })
    : capability.reason
}
