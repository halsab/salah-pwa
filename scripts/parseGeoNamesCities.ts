export type LegacyCompactCityRecord = [
  id: number,
  name: string,
  searchNames: string,
  countryCode: string,
  latitude: number,
  longitude: number,
  population: number,
]

export type CompactCityRecord = [
  ...LegacyCompactCityRecord,
  timeZone: string,
]

interface ParsedCities {
  updatedAt: string
  cities: CompactCityRecord[]
}

export interface LegacyCityDataset<Source = unknown> {
  schemaVersion: 1
  source: Source
  cities: LegacyCompactCityRecord[]
}

const CYRILLIC = /\p{Script=Cyrillic}/u
const MAX_SEARCH_NAMES = 8
const MAX_SEARCH_NAMES_LENGTH = 160
const VALID_TIME_ZONES = new Set<string>()

function roundCoordinate(value: string): number {
  return Number(Number(value).toFixed(4))
}

function assertValidTimeZone(timeZone: string, cityId: number): void {
  if (VALID_TIME_ZONES.has(timeZone)) return

  try {
    new Intl.DateTimeFormat('en', { timeZone })
    VALID_TIME_ZONES.add(timeZone)
  } catch {
    throw new Error(
      `GeoNames вернул некорректный часовой пояс ${timeZone} для города ${cityId}`,
    )
  }
}

function getSearchNames(
  name: string,
  asciiName: string,
  alternateNames: string,
): string {
  const candidates = [
    ...(asciiName && asciiName !== name ? [asciiName] : []),
    ...alternateNames.split(',').filter((name) => CYRILLIC.test(name)),
  ]
  const unique: string[] = []

  for (const candidate of candidates) {
    const name = candidate.trim()
    if (!name || unique.includes(name)) continue
    if ([...unique, name].join(' ').length > MAX_SEARCH_NAMES_LENGTH) break
    unique.push(name)
    if (unique.length === MAX_SEARCH_NAMES) break
  }
  return unique.join(' ')
}

export function parseGeoNamesCities(content: string): ParsedCities {
  const cities: CompactCityRecord[] = []
  let updatedAt = ''

  for (const line of content.split('\n')) {
    if (!line) continue
    const columns = line.split('\t')
    const id = Number(columns[0])
    const name = columns[1] ?? ''
    const asciiName = columns[2] ?? ''
    const alternateNames = columns[3] ?? ''
    const latitude = columns[4] ?? ''
    const longitude = columns[5] ?? ''
    const countryCode = columns[8] ?? ''
    const population = Number(columns[14])
    const timeZone = columns[17] ?? ''
    const modifiedAt = columns[18] ?? ''

    if (
      !Number.isInteger(id) ||
      !name ||
      !countryCode ||
      !Number.isFinite(population) ||
      population < 5_000
    ) {
      continue
    }

    assertValidTimeZone(timeZone, id)
    const searchNames = getSearchNames(name, asciiName, alternateNames)
    cities.push([
      id,
      name,
      searchNames,
      countryCode,
      roundCoordinate(latitude),
      roundCoordinate(longitude),
      population,
      timeZone,
    ])
    if (modifiedAt > updatedAt) updatedAt = modifiedAt
  }

  cities.sort((left, right) => right[6] - left[6])
  return { updatedAt, cities }
}

export function enrichLegacyCities(
  legacyCities: LegacyCompactCityRecord[],
  currentCities: CompactCityRecord[],
): CompactCityRecord[] {
  const timeZoneById = new Map<number, string>()
  const timeZonesByCountry = new Map<string, Set<string>>()

  for (const city of currentCities) {
    const id = city[0]
    const countryCode = city[3]
    const timeZone = city[7]
    assertValidTimeZone(timeZone, id)
    timeZoneById.set(id, timeZone)

    const countryTimeZones = timeZonesByCountry.get(countryCode) ?? new Set()
    countryTimeZones.add(timeZone)
    timeZonesByCountry.set(countryCode, countryTimeZones)
  }

  return legacyCities.map((city) => {
    const id = city[0]
    const countryCode = city[3]
    const countryTimeZones = timeZonesByCountry.get(countryCode)
    const timeZone = timeZoneById.get(id)
      ?? (countryTimeZones?.size === 1
        ? countryTimeZones.values().next().value
        : undefined)

    if (!timeZone) {
      throw new Error(
        `Не удалось однозначно определить часовой пояс для города ${id} (${countryCode})`,
      )
    }

    return [...city, timeZone]
  })
}

export function enrichLegacyDataset<Source>(
  dataset: LegacyCityDataset<Source>,
  currentCities: CompactCityRecord[],
): {
  schemaVersion: 2
  source: Source
  cities: CompactCityRecord[]
} {
  return {
    schemaVersion: 2,
    source: dataset.source,
    cities: enrichLegacyCities(dataset.cities, currentCities),
  }
}
