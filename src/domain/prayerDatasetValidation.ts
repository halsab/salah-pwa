import { isValidTimeZone } from './locationTime'
import { OFFICIAL_TIME_FIELDS, OPTIONAL_OFFICIAL_TIME_FIELDS, REQUIRED_LEGACY_OFFICIAL_TIME_FIELDS, REQUIRED_OFFICIAL_TIME_FIELDS, type PrayerDataset, type PrayerDay } from './types'

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/

function isCivilDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function isPrayerDay(value: unknown, schemaVersion = 0): value is PrayerDay {
  if (!value || typeof value !== 'object') return false
  const day = value as Partial<PrayerDay>
  const record = value as Record<string, unknown>
  const provenance: unknown = record.provenance
  if ('suhurEnd' in value || typeof day.locationId !== 'string' || !day.locationId || !isCivilDate(day.date)) return false
  const requiredFields = schemaVersion === 1 || schemaVersion === 2
    ? [...REQUIRED_OFFICIAL_TIME_FIELDS, ...REQUIRED_LEGACY_OFFICIAL_TIME_FIELDS]
    : REQUIRED_OFFICIAL_TIME_FIELDS
  const validTimes = requiredFields.every(key => typeof day[key] === 'string' && TIME_PATTERN.test(day[key]))
    && OPTIONAL_OFFICIAL_TIME_FIELDS.every(key => day[key] === undefined || typeof day[key] === 'string' && TIME_PATTERN.test(day[key]))
  if (!validTimes) return false
  if (provenance === undefined) {
    return schemaVersion < 3 || (!OPTIONAL_OFFICIAL_TIME_FIELDS.some(key => key.endsWith('Jamaat') && day[key] !== undefined)
      && day.zenith === undefined)
  }
  if (typeof provenance !== 'object' || provenance === null || Array.isArray(provenance)) return false
  const provenanceEntries = provenance as Record<string, unknown>
  if (schemaVersion === 3 && day.zenith !== undefined
    && (!Object.hasOwn(provenanceEntries, 'zenith')
      || (provenanceEntries.zenith !== 'published' && provenanceEntries.zenith !== 'calculated'))) return false
  return Object.entries(provenanceEntries).every(([key, origin]) => {
    if (!OFFICIAL_TIME_FIELDS.includes(key as typeof OFFICIAL_TIME_FIELDS[number])
      || record[key] === undefined
      || (origin !== 'published' && origin !== 'calculated')) return false
    if (origin === 'calculated' && key !== 'zenith') return false
    if (schemaVersion === 3 && key.endsWith('Jamaat') && origin !== 'published') return false
    return true
  }) && OPTIONAL_OFFICIAL_TIME_FIELDS.filter(key => key.endsWith('Jamaat') && day[key] !== undefined)
    .every(key => provenanceEntries[key] === 'published' || schemaVersion < 3)
}

export function normalizeStoredPrayerDay(value: unknown, schemaVersion: number): PrayerDay | null {
  if (!value || typeof value !== 'object' || (schemaVersion !== 1 && schemaVersion !== 2 && schemaVersion !== 3)) return null
  const record = value as Record<string, unknown>
  const hasFajrStart = Object.hasOwn(record, 'fajrStart')
  const hasSuhurEnd = Object.hasOwn(record, 'suhurEnd')
  if (hasFajrStart && hasSuhurEnd) return null
  if (schemaVersion === 3 && hasSuhurEnd) return null
  if ((schemaVersion === 2 || schemaVersion === 3) && hasFajrStart && isPrayerDay(record, schemaVersion)) return record
  if (!hasSuhurEnd || hasFajrStart || typeof record.suhurEnd !== 'string') return null
  const { suhurEnd, ...rest } = record
  const normalized = { ...rest, fajrStart: suhurEnd }
  return isPrayerDay(normalized, schemaVersion) ? normalized : null
}

export function normalizeStoredPrayerDataset(value: unknown): PrayerDataset | null {
  if (!value || typeof value !== 'object') return null
  const stored = value as Partial<PrayerDataset>
  if ((stored.schemaVersion !== 1 && stored.schemaVersion !== 2 && stored.schemaVersion !== 3) || !Array.isArray(stored.days)) return null
  const days: PrayerDay[] = []
  for (const day of stored.days) {
    const normalized = normalizeStoredPrayerDay(day, stored.schemaVersion)
    if (!normalized) return null
    days.push(normalized)
  }
  let source = stored.source
  if (stored.schemaVersion === 1) {
    if (!source || typeof source !== 'object') return null
    const legacySource = source as unknown as Record<string, unknown>
    const year = legacySource.year
    const existingYears = legacySource.years
    if (year !== undefined && (typeof year !== 'number' || !Number.isInteger(year) || year < 1000 || year > 9999
      || existingYears !== undefined && (!Array.isArray(existingYears) || existingYears.length !== 1 || existingYears[0] !== year))) return null
    const years = existingYears ?? (typeof year === 'number' ? [year] : undefined)
    const { year: _year, ...rest } = legacySource
    source = (years ? { ...rest, years } : rest) as PrayerDataset['source']
  }
  const canonical = { ...stored, source, schemaVersion: stored.schemaVersion === 3 ? 3 : 2, days }
  return isPrayerDataset(canonical) ? canonical : null
}

export function isPrayerDataset(value: unknown): value is PrayerDataset {
  if (!value || typeof value !== 'object') return false
  const d = value as Partial<PrayerDataset>
  if ((d.schemaVersion !== 2 && d.schemaVersion !== 3) || !d.source || typeof d.source.name !== 'string' || !d.source.name.trim()
    || typeof d.source.url !== 'string' || !isHttpsSourceUrl(d.source.url)
    || typeof d.source.updatedAt !== 'string' || !Number.isFinite(Date.parse(d.source.updatedAt)) || !Array.isArray(d.source.years) || !d.source.years.length
    || !d.source.years.every(y => Number.isInteger(y) && y >= 1000 && y <= 9999)
    || new Set(d.source.years).size !== d.source.years.length
    || !Array.isArray(d.locations) || !d.locations.length || !Array.isArray(d.days)) return false
  if (d.schemaVersion === 2 && (d.source.name !== 'ДУМ Республики Татарстан'
    || d.source.url !== 'https://dumrt.ru/ru/help-info/prayertime/')) return false
  const locations = new Set<string>()
  for (const item of d.locations) {
    const location = item as typeof item | null
    if (!location || typeof location.id !== 'string' || !location.id || locations.has(location.id)
      || typeof location.name !== 'string' || !location.name
      || !Number.isFinite(location.latitude) || Math.abs(location.latitude) > 90
      || !Number.isFinite(location.longitude) || Math.abs(location.longitude) > 180
      || (location.timeZone !== undefined && !isValidTimeZone(location.timeZone))) return false
    locations.add(location.id)
  }
  if (d.schemaVersion === 3) {
    const provider = d.provider
    const coverage: unknown = provider?.coverage
    if (!coverage || typeof coverage !== 'object') return false
    const providerCoverage = coverage as Record<string, unknown>
    if (!provider || typeof provider.id !== 'string' || !/^[a-z0-9][a-z0-9.-]*$/.test(provider.id)
      || typeof provider.revision !== 'string' || !provider.revision.trim()
      || typeof provider.timeZone !== 'string' || !isValidTimeZone(provider.timeZone)
      || typeof providerCoverage.geographic !== 'string' || !providerCoverage.geographic.trim()
      || !isCivilDate(providerCoverage.startDate) || !isCivilDate(providerCoverage.endDate)
      || providerCoverage.startDate > providerCoverage.endDate) return false
    if (provider.id === 'dumRt' && (d.source.name !== 'ДУМ Республики Татарстан'
      || d.source.url !== 'https://dumrt.ru/ru/help-info/prayertime/'
      || provider.timeZone !== 'Europe/Moscow' || providerCoverage.geographic !== 'RU-TA')) return false
    const startDate = providerCoverage.startDate
    const endDate = providerCoverage.endDate
    if (!d.source.years.every(year => year >= Number(startDate.slice(0, 4))
      && year <= Number(endDate.slice(0, 4)))) return false
  }
  const dates = new Set<string>()
  const count = d.schemaVersion === 3 && d.provider
    ? (Date.parse(`${d.provider.coverage.endDate}T00:00:00Z`) - Date.parse(`${d.provider.coverage.startDate}T00:00:00Z`)) / 86_400_000 + 1
    : d.source.years.reduce((total, year) => total + (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000, 0)
  if (d.days.length !== count * locations.size) return false
  for (const day of d.days) {
    if (!isPrayerDay(day, d.schemaVersion) || !locations.has(day.locationId) || !d.source.years.includes(Number(day.date.slice(0, 4)))) return false
    if (d.schemaVersion === 3 && (day.date < (d.provider?.coverage.startDate ?? '') || day.date > (d.provider?.coverage.endDate ?? ''))) return false
    const key = `${day.locationId}:${day.date}`
    if (dates.has(key)) return false
    dates.add(key)
  }
  if (d.schemaVersion === 3 && d.provider) {
    for (const locationId of locations) {
      for (let instant = Date.parse(`${d.provider.coverage.startDate}T00:00:00Z`); instant <= Date.parse(`${d.provider.coverage.endDate}T00:00:00Z`); instant += 86_400_000) {
        if (!dates.has(`${locationId}:${new Date(instant).toISOString().slice(0, 10)}`)) return false
      }
    }
  }
  return true
}

function isHttpsSourceUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password
  } catch {
    return false
  }
}
