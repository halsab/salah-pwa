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

export type SalahPrayerKey = Extract<
  PrayerKey,
  'fajrJamaat' | 'dhuhr' | 'asr' | 'maghrib' | 'isha'
>

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

export interface PrayerDataset {
  schemaVersion: number
  source: {
    name: string
    url: string
    updatedAt: string
    year: number
  }
  locations: PrayerLocation[]
  days: PrayerDay[]
}
