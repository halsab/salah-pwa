export type PrayerTime = `${number}:${number}`

export type PrayerKey =
  | 'suhurEnd'
  | 'fajrJamaat'
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
  suhurEnd: PrayerTime
  fajrJamaat: PrayerTime
  sunrise: PrayerTime
  zenith: PrayerTime
  dhuhr: PrayerTime
  asr: PrayerTime
  maghrib: PrayerTime
  isha: PrayerTime
}

export interface PrayerLocation {
  id: string
  name: string
  latitude: number
  longitude: number
}

export interface SavedCoordinates {
  latitude: number
  longitude: number
  timeZone: string
  accuracy: number | null
  timestamp: number
  name?: string
  cityId?: number
  nameSource?: 'geonames' | 'nominatim'
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
  url: 'prayer-times-current.json'
  sha256: string
}
