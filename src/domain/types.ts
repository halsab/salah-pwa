export type PrayerTime = `${number}:${number}`

export type CalculatedPrayerKey =
  | 'fajr'
  | 'sunrise'
  | 'zenith'
  | 'dhuhr'
  | 'asr'
  | 'maghrib'
  | 'isha'

export interface Locality {
  id: string
  name: string
  latitude: number
  longitude: number
  timeZone?: string
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
