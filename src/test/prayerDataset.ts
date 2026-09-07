import { addDays } from '../domain/date'
import type { PrayerDataset, PrayerDay } from '../domain/types'

export function completeDataset(): PrayerDataset {
  const day: PrayerDay = { locationId: 'kazan', date: '2026-01-01', suhurEnd: '02:21', fajrJamaat: '03:17', sunrise: '04:48', zenith: '11:44', dhuhr: '12:00', asr: '16:24', maghrib: '18:39', isha: '20:33' }
  return {
    schemaVersion: 2,
    source: { name: 'ДУМ Республики Татарстан', url: 'https://dumrt.ru/ru/help-info/prayertime/', updatedAt: '2025-12-27T10:49:10.000Z', years: [2026] },
    locations: [{ id: 'kazan', name: 'Казань', latitude: 55.7946, longitude: 49.1115 }],
    days: Array.from({ length: 365 }, (_, index) => ({ ...day, date: addDays('2026-01-01', index) })),
  }
}
