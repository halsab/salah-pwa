export type PrayerTime = `${number}:${number}`

export type PrayerKey =
  | 'fajrStart'
  | 'fajrJamaat'
  | 'dhuhrJamaat'
  | 'asrJamaat'
  | 'maghribJamaat'
  | 'ishaJamaat'
  | 'sunrise'
  | 'zenith'
  | 'dhuhr'
  | 'asr'
  | 'maghrib'
  | 'isha'

export type CalculatedPrayerKey =
  | 'fajr'
  | 'sunrise'
  | 'zenith'
  | 'dhuhr'
  | 'asr'
  | 'maghrib'
  | 'isha'

export type SchedulePrayerKey = PrayerKey | 'fajr'

export interface PrayerDay {
  locationId: string
  date: string
  fajrStart: PrayerTime
  fajrJamaat?: PrayerTime
  dhuhrJamaat?: PrayerTime
  asrJamaat?: PrayerTime
  maghribJamaat?: PrayerTime
  ishaJamaat?: PrayerTime
  sunrise: PrayerTime
  zenith?: PrayerTime
  dhuhr: PrayerTime
  asr: PrayerTime
  maghrib: PrayerTime
  isha: PrayerTime
  provenance?: Partial<Record<PrayerKey, 'published' | 'calculated'>>
  timeZone?: string
  coordinates?: { latitude: number; longitude: number }
}

export interface PrayerLocation {
  id: string
  name: string
  latitude: number
  longitude: number
  timeZone?: string
}

export interface PrayerDatasetProvider {
  id: string
  revision: string
  timeZone: string
  coverage: {
    geographic: string
    startDate: string
    endDate: string
  }
}

export interface SavedCoordinates {
  latitude: number
  longitude: number
  timeZone: string
  accuracy: number | null
  timestamp: number
  name?: string
  cityId?: number
  source?: 'gps' | 'preset'
}

export interface CalculatedPrayerEntry {
  time: PrayerTime
  instant: number
  estimated: boolean
}

export type CalculatedPrayerEntries = {
  [Key in CalculatedPrayerKey]: CalculatedPrayerEntry
}

export interface PrayerDataset {
  schemaVersion: number
  provider?: PrayerDatasetProvider
  source: {
    name: string
    url: string
    updatedAt: string
    years: number[]
  }
  locations: PrayerLocation[]
  days: PrayerDay[]
}

export interface PrayerDatasetManifest {
  schemaVersion: 1
  version: string
  url: string
  sha256: string
  sequence?: number
  provider?: string
}

export const REQUIRED_OFFICIAL_TIME_FIELDS = [
  'fajrStart', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha',
] as const satisfies readonly PrayerKey[]

export const OPTIONAL_OFFICIAL_TIME_FIELDS = [
  'fajrJamaat', 'dhuhrJamaat', 'asrJamaat', 'maghribJamaat', 'ishaJamaat', 'zenith',
] as const satisfies readonly PrayerKey[]

export const REQUIRED_LEGACY_OFFICIAL_TIME_FIELDS = [
  'fajrJamaat', 'zenith',
] as const satisfies readonly PrayerKey[]

export const OFFICIAL_TIME_FIELDS = [
  'fajrStart', 'fajrJamaat', 'sunrise', 'zenith', 'dhuhr', 'dhuhrJamaat', 'asr', 'asrJamaat',
  'maghrib', 'maghribJamaat', 'isha', 'ishaJamaat',
] as const satisfies readonly PrayerKey[]
