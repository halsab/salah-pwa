import { OFFICIAL_TIME_FIELDS, type PrayerDataset, type PrayerDay } from './types'

export function isPrayerDay(value: unknown): value is PrayerDay {
  if (!value || typeof value !== 'object') return false
  const day = value as Partial<PrayerDay>
  if (typeof day.locationId !== 'string' || typeof day.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day.date)) return false
  const parsed = new Date(`${day.date}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day.date
    && OFFICIAL_TIME_FIELDS.every(key => typeof day[key] === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(day[key]))
}
export function isPrayerDataset(value: unknown): value is PrayerDataset {
  if (!value || typeof value !== 'object') return false
  const d = value as Partial<PrayerDataset>
  if (d.schemaVersion !== 2 || !d.source || typeof d.source.name !== 'string' || !d.source.name
    || typeof d.source.url !== 'string' || !/^https:\/\//.test(d.source.url)
    || typeof d.source.updatedAt !== 'string' || !Number.isFinite(Date.parse(d.source.updatedAt)) || !Array.isArray(d.source.years) || !d.source.years.length
    || !d.source.years.every(y => Number.isInteger(y) && y >= 1000 && y <= 9999)
    || new Set(d.source.years).size !== d.source.years.length
    || !Array.isArray(d.locations) || !d.locations.length || !Array.isArray(d.days)) return false
  const locations = new Set<string>()
  for (const item of d.locations) {
    const location = item as typeof item | null
    if (!location || typeof location.id !== 'string' || !location.id || locations.has(location.id)
      || typeof location.name !== 'string' || !location.name
      || !Number.isFinite(location.latitude) || Math.abs(location.latitude) > 90
      || !Number.isFinite(location.longitude) || Math.abs(location.longitude) > 180) return false
    locations.add(location.id)
  }
  const dates = new Set<string>()
  const count = d.source.years.reduce((total, year) => total + (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000, 0)
  if (d.days.length !== count * locations.size) return false
  for (const day of d.days) {
    if (!isPrayerDay(day) || !locations.has(day.locationId) || !d.source.years.includes(Number(day.date.slice(0, 4)))) return false
    const key = `${day.locationId}:${day.date}`
    if (dates.has(key)) return false
    dates.add(key)
  }
  return true
}
