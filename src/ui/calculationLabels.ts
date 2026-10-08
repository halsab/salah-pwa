import type { AsrMethod, CalculationProfileId, HighLatitudeMethod } from '../domain/prayerCalculation'
import type { CalculatedPrayerKey } from '../domain/types'
import type { MessageKey } from '../localization/messages'

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
