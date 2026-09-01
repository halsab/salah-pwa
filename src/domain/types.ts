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

export type SalahPrayerKey = Extract<
  PrayerKey,
  'fajrJamaat' | 'dhuhr' | 'asr' | 'maghrib' | 'isha'
>

export type ScheduleSalahPrayerKey =
  | 'fajr'
  | 'fajrJamaat'
  | 'dhuhr'
  | 'asr'
  | 'maghrib'
  | 'isha'

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
  accuracy: number | null
  timestamp: number
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
