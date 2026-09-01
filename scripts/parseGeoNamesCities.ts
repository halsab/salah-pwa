export type CompactCityRecord = [
  id: number,
  name: string,
  searchNames: string,
  countryCode: string,
  latitude: number,
  longitude: number,
  population: number,
]

interface ParsedCities {
  updatedAt: string
  cities: CompactCityRecord[]
}

const CYRILLIC = /\p{Script=Cyrillic}/u
const MAX_SEARCH_NAMES = 8
const MAX_SEARCH_NAMES_LENGTH = 160

function roundCoordinate(value: string): number {
  return Number(Number(value).toFixed(4))
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

    const searchNames = getSearchNames(name, asciiName, alternateNames)
    cities.push([
      id,
      name,
      searchNames,
      countryCode,
      roundCoordinate(latitude),
      roundCoordinate(longitude),
      population,
    ])
    if (modifiedAt > updatedAt) updatedAt = modifiedAt
  }

  cities.sort((left, right) => right[6] - left[6])
  return { updatedAt, cities }
}
